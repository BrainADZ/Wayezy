/** The centre's supplied green logo, shared by COMMAND sign-in and navigation. */
export function CentreLogo({ className = '' }: { className?: string }) {
  return (
    <img className={`centre-logo ${className}`} src="/Green%20logo.png" alt="IREO Boulevard" />
  );
}
