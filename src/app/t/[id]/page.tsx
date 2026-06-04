import { redirect } from 'next/navigation';

// Short shareable tutorial links: /t/<deck-id> → opens that deck in the player.
// Example: https://unth-theatre-mai.vercel.app/t/pharmacy
export default function TutorialShortLink({ params }: { params: { id: string } }) {
  redirect(`/dashboard/presentation?deck=${encodeURIComponent(params.id)}`);
}
