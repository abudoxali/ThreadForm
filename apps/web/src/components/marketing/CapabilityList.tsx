const capabilities = [
  {
    title: '3D and 2D studios',
    body: 'Preview garments as a real-time 3D scene or lay out flat, hanging and ghost-model mockups in 2D — sharing one underlying project.',
  },
  {
    title: 'Materials and effects',
    body: 'Cotton, fleece, denim and more, each with tunable fabric properties, plus a growing library of print and finish effects.',
  },
  {
    title: 'Camera, light and animation',
    body: 'Direct the shot with camera presets, three-point lighting, and turntable or motion animations.',
  },
  {
    title: 'Export for where it ships',
    body: 'Images, video and 3D files sized for the aspect ratios and platforms your work actually goes to.',
  },
] as const;

export function CapabilityList() {
  return (
    <section id="capabilities" className="border-border border-t py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-primary text-2xl font-semibold tracking-tight sm:text-3xl">
          Built for the whole mockup, not just the print.
        </h2>
        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <div key={capability.title} className="border-border border-t pt-5">
              <h3 className="text-primary text-lg font-medium">{capability.title}</h3>
              <p className="text-secondary mt-2 text-sm leading-relaxed">{capability.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
