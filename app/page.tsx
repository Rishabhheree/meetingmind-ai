import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Home() {
  // Redirect to signin - authentication is handled client-side
  redirect('/auth/signin');
}
