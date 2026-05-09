import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HOD Onboarding Circular — UNTH ORM',
};

export default function HodLetterPrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
