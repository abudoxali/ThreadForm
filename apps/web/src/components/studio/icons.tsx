import type { SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function GarmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 4 6 6 3 8l2 4 2-1v9h10v-9l2 1 2-4-3-2-2-2-2 1h-4z" />
    </Icon>
  );
}

export function ArtworkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="M20 15l-5-5-9 9" />
    </Icon>
  );
}

export function MaterialIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16M4 12h16" opacity={0.5} />
    </Icon>
  );
}

export function EffectsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function SceneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
    </Icon>
  );
}

export function AnimationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12a7 7 0 0 1 12-5" />
      <path d="M19 12a7 7 0 0 1-12 5" />
      <path d="M17 4v3h-3M7 20v-3h3" />
    </Icon>
  );
}

export function ExportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </Icon>
  );
}
