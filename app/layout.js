import './globals.css';

export const metadata = {
  title: 'CineSync — Watch Together, Live',
  description: 'Watch movies together with live camera feeds, synced playback, and real-time chat.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
