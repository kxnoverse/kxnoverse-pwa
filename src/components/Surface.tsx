import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type SurfaceVariant = "panel" | "inset" | "glass";

type SurfaceProps<T extends ElementType> = {
  as?: T;
  variant?: SurfaceVariant;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Surface<T extends ElementType = "div">({
  as,
  variant = "panel",
  className,
  children,
  ...props
}: SurfaceProps<T>) {
  const Element = as ?? "div";
  const classes = ["kx-surface", `kx-surface--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  );
}
