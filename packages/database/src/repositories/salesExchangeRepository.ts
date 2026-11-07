import type { Pool, PoolClient } from "pg";
import {
  type POSExchangeInput,
  type POSExchangeResult,
  type SalesReturnRecord,
  type GoldBuybackOrderRecord,
  type SalesInvoiceRecord,
  RefundMethod,
  BuybackPayoutMethod,
} from "@jewelcore/shared";
import { withTransaction } from "../transaction.js";
import { processSalesReturn } from "./salesReturnRepository.js";
import {
  createGoldBuybackOrder,
  settleGoldBuybackOrder,
} from "./goldBuybackRepository.js";
import {
  createSalesInvoice,
  finalizeSaleAndReleaseCustody,
} from "./salesInvoiceRepository.js";
import { recordSalesPayment } from "./salesPaymentRepository.js";
import { getStoreCreditAccountByCustomerId } from "./storeCreditRepository.js";

type Queryable = Pool | PoolClient;

/**
 * Atomically orchestrates a complete POS Exchange and Trade-in transaction (FEAT-RET-04).
 * Guarantees:
 * 1. Evaluates returns and/or scrap gold buybacks and credits customer's store credit account.
 * 2. Creates sales invoice for new jewellery pieces chosen by the customer.
 * 3. Automatically redeems store credit tender against the new invoice balance.
 * 4. Accepts split tender for any remaining balance (cash, card, etc.).
 * 5. If fully settled, finalizes sale and releases physical custody of new items (INV-09).
 * 6. Any surplus trade-in value remains safely banked in customer's store credit account.
 */
export async function processPOSExchange(
  input: POSExchangeInput & {
    organizationId: string;
    actorUserId: string;
  },
  clientOverride?: Queryable,
): Promise<POSExchangeResult> {
  const runner = async (client: Queryable): Promise<POSExchangeResult> => {
    let salesReturn: SalesReturnRecord | undefined;
    let goldBuybackOrder: GoldBuybackOrderRecord | undefined;
    let tradeInCreditGeneratedCad = 0;

    // 1. Process returned pieces if present (FEAT-RET-01 -> FEAT-RET-03)
    if (input.returns && input.returns.items.length > 0) {
      salesReturn = await processSalesReturn(
        {
          organizationId: input.organizationId,
          storeId: input.storeId,
          processedByUserId: input.actorUserId,
          salesInvoiceId: input.returns.salesInvoiceId,
          returnReason: input.returns.returnReason,
          refundMethod: RefundMethod.STORE_CREDIT,
          items: input.returns.items,
          notes: input.notes
            ? `POS Exchange: ${input.notes}`
            : "POS Exchange trade-in return",
        },
        client,
      );
      tradeInCreditGeneratedCad += salesReturn.netRefundAmountCad;
    }

    // 2. Process old gold / scrap buybacks if present (FEAT-RET-02 -> FEAT-RET-03)
    if (input.buybacks && input.buybacks.items.length > 0) {
      const createdBuyback = await createGoldBuybackOrder(
        {
          organizationId: input.organizationId,
          storeId: input.storeId,
          customerId: input.customerId,
          createdByUserId: input.actorUserId,
          payoutMethod: BuybackPayoutMethod.TRADE_IN_EXCHANGE,
          items: input.buybacks.items,
          notes: input.notes
            ? `POS Exchange: ${input.notes}`
            : "POS Exchange trade-in buyback",
        },
        client,
      );

      goldBuybackOrder = await settleGoldBuybackOrder(
        {
          id: createdBuyback.id,
          organizationId: input.organizationId,
          settledByUserId: input.actorUserId,
          input: {
            payoutMethod: BuybackPayoutMethod.TRADE_IN_EXCHANGE,
            payoutReference: "APPLIED_TO_EXCHANGE",
            notes: "Applied as trade-in tender against POS exchange",
          },
        },
        client,
      );
      tradeInCreditGeneratedCad += goldBuybackOrder.netPayoutAmountCad;
    }

    // 3. Create sales invoice for new items selected by customer (FEAT-SALES-02)
    const invoiceNumber = `INV-EXC-${Date.now()}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;

    let invoice: SalesInvoiceRecord = await createSalesInvoice(
      {
        organizationId: input.organizationId,
        storeId: input.storeId,
        customerId: input.customerId,
        createdByUserId: input.actorUserId,
        invoiceNumber,
        discountAmountCad: 0,
        items: input.newItems.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          unitPriceCad: item.unitPriceCad,
          discountAmountCad: item.discountAmountCad ?? 0,
          taxRate: item.taxRate ?? 0.13,
        })),
        notes: input.notes
          ? `POS Exchange Invoice: ${input.notes}`
          : "POS Exchange sale",
      },
      client,
    );

    // 4. Retrieve customer's store credit balance (including credits just generated)
    const creditAccount = await getStoreCreditAccountByCustomerId(
      {
        customerId: input.customerId,
        organizationId: input.organizationId,
      },
      client,
    );

    const availableCredit = creditAccount.balanceCad;
    const invoiceBalanceDue = invoice.balanceDueCad;
    const creditToApply = Math.min(availableCredit, invoiceBalanceDue);
    let storeCreditAppliedCad = 0;

    // 5. Apply store credit tender against new invoice (FEAT-SALES-03)
    if (creditToApply > 0) {
      const creditPayment = await recordSalesPayment(
        {
          organizationId: input.organizationId,
          storeId: input.storeId,
          salesInvoiceId: invoice.id,
          receivedByUserId: input.actorUserId,
          paymentMethod: "STORE_CREDIT",
          amountCad: creditToApply,
          notes: "Store credit & trade-in tender",
        },
        client,
      );
      invoice = creditPayment.invoice;
      storeCreditAppliedCad = creditToApply;
    }

    // 6. Apply additional payment tenders if any balance remains
    if (input.additionalPayments && input.additionalPayments.length > 0) {
      for (const payment of input.additionalPayments) {
        if (invoice.balanceDueCad > 0) {
          const paymentResult = await recordSalesPayment(
            {
              organizationId: input.organizationId,
              storeId: input.storeId,
              salesInvoiceId: invoice.id,
              receivedByUserId: input.actorUserId,
              paymentMethod: payment.paymentMethod,
              amountCad: payment.amountCad,
              referenceNumber: payment.referenceNumber ?? undefined,
              cardLast4: payment.cardLast4 ?? undefined,
              notes: "Exchange balance settlement",
            },
            client,
          );
          invoice = paymentResult.invoice;
        }
      }
    }

    // 7. If fully paid, finalize sale and release physical custody (FEAT-SALES-04)
    let isFinalized = false;
    let releasedPieceIds: string[] = [];

    if (invoice.status === "PAID" && invoice.balanceDueCad === 0) {
      const releaseResult = await finalizeSaleAndReleaseCustody(
        {
          invoiceId: invoice.id,
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          reason: "POS Exchange completed and custody released",
        },
        client,
      );
      isFinalized = true;
      releasedPieceIds = releaseResult.releasedPieceIds;
    }

    // 8. Fetch customer's remaining store credit balance
    const updatedCreditAccount = await getStoreCreditAccountByCustomerId(
      {
        customerId: input.customerId,
        organizationId: input.organizationId,
      },
      client,
    );

    return {
      invoice,
      salesReturn,
      goldBuybackOrder,
      tradeInCreditGeneratedCad,
      storeCreditAppliedCad,
      customerStoreCreditBalanceCad: updatedCreditAccount.balanceCad,
      isFinalized,
      releasedPieceIds,
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}
