const steps = [
  {
    title: 'Choose a garment',
    body: 'Start from a data-driven garment — a t-shirt, hoodie, jersey, or another silhouette — each with its own print zones.',
  },
  {
    title: 'Place your artwork',
    body: 'Upload PNG, JPG, WEBP or SVG artwork and position it precisely within a print zone as its own layer.',
  },
  {
    title: 'Tune material and light',
    body: 'Adjust garment color, fabric, camera angle, lighting and background to match the shot you need.',
  },
  {
    title: 'Export',
    body: 'Produce images, video, or a 3D file at the resolution and aspect ratio your channel expects.',
  },
] as const;

export function WorkflowSteps() {
  return (
    <section id="workflow" className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          One project, from artwork to export.
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="text-sm font-medium text-accent">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-2 text-lg font-medium text-primary">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
