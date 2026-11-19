import './globals.css';

export const metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: 'AvaStars Hire',
  description: 'Recruitment workspace for AvaStars',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
