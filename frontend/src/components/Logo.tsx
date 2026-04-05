import logoSrc from "../assets/carepilot-logo.svg";

export type LogoVariant = "default" | "compact" | "hero";

type LogoProps = {
  variant?: LogoVariant;
  className?: string;
};

/**
 * CarePilot mark (square SVG — icon + wordmark). Scales with object-fit: contain only.
 */
export function Logo({ variant = "default", className = "" }: LogoProps) {
  const variantClass =
    variant === "compact" ? "cp-logo--compact" : variant === "hero" ? "cp-logo--hero" : "";
  return (
    <div className={`cp-logo ${variantClass} ${className}`.trim()}>
      <img
        src={logoSrc}
        alt="CarePilot"
        className="cp-logo__img"
        width={1024}
        height={1024}
        decoding="async"
      />
    </div>
  );
}
