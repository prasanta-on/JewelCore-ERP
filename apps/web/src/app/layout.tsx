import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JewelCore ERP — Next-Gen Jewellery Enterprise Management",
  description:
    "Enterprise ERP for precious jewellery manufacturing, quality control, inventory, and retail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
