const LOGO_SRC = "/carepilot-logo.png";

export type LogoVariant = "default" | "compact" | "hero";

type LogoProps = {
  variant?: LogoVariant;
  className?: string;
};

export function Logo({ variant = "default", className = "" }: LogoProps) {
  const variantClass =
    variant === "compact" ? "cp-logo--compact" : variant === "hero" ? "cp-logo--hero" : "";
  return (
    <div className={`cp-logo ${variantClass} ${className}`.trim()}>
      <img
        src={LOGO_SRC}
        alt="CarePilot"
        className="cp-logo__img"
        width={536}
        height={465}
        decoding="async"
      />
    </div>
  );
}
