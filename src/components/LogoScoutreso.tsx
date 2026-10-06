import Image from "next/image";

/** Logo horizontal de Scoutréso (SVG, net à toutes les tailles). */
export function LogoScoutreso({ className = "h-12" }: { className?: string }) {
  return (
    <Image
      src="/logo/scoutreso-horizontal.svg"
      alt="Scoutréso"
      width={1514}
      height={420}
      priority
      className={`w-auto ${className}`}
    />
  );
}
