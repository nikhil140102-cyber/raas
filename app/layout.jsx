import { appUrl } from '@/lib/util';
import { reloadConfig } from '@/lib/db';
import './globals.css';

export async function generateMetadata() {
  await reloadConfig().catch(() => {});
  return { metadataBase: new URL(appUrl()), title: 'AvaStars Hire', description: 'Recruitment workspace for AvaStars' };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
