import { LiveReport } from '@/components/live/live-report';

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveReport reportId={id} />;
}
