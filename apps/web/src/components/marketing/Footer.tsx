export function MarketingFooter() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-tertiary sm:flex-row sm:px-6">
        <p>&copy; {new Date().getFullYear()} ThreadForm.</p>
        <p>Building the foundation for the 3D studio.</p>
      </div>
    </footer>
  );
}
