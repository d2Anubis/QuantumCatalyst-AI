import "./globals.css";

export const metadata = {
  title: "QuantumCatalyst AI | The Operating System for Catalyst Discovery",
  description:
    "QuantumCatalyst AI combines quantum chemistry, generative AI, and continuous experimental learning to discover breakthrough catalysts for sustainable fuels, carbon conversion, and synthetic biology.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
