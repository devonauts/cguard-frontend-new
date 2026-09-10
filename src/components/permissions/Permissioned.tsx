import React, { ReactNode } from "react";
import { Link, LinkProps } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

type PermissionProps = {
  permission?: string;
  any?: string[];
  hide?: boolean; // if true, do not render when no permission
  fallback?: ReactNode;
};

type BtnProps = React.ComponentProps<typeof Button>;

export function PermissionedButton(
  props: PermissionProps & BtnProps & { children: ReactNode },
) {
  const { permission, any, hide, fallback, children, ...rest } = props;
  const { hasPermission, hasAny } = usePermissions();
  const allowed = permission
    ? hasPermission(permission)
    : any
      ? hasAny(any as string[])
      : true;
  // By default, hide the control when not allowed unless `hide` is explicitly false.
  const shouldHide = hide === undefined ? true : Boolean(hide);

  if (!allowed && shouldHide) return <>{fallback ?? null}</>;

  // If child is passed with `asChild` (Button will render child like a Link),
  // cloning the child and preventing default navigation is required when not allowed.
  const asChild = (rest as any).asChild;

  if (!allowed && asChild) {
    const child = React.Children.only(children);

    if (React.isValidElement(child)) {
      const childEl = child as React.ReactElement<any>;
      const mergedClass = cn(
        (rest as any).className,
        (childEl.props as any).className,
      );

      return React.cloneElement(childEl, {
        className: cn(mergedClass, "opacity-50 pointer-events-none"),
        onClick: (e: any) => {
          e?.preventDefault?.();
        },
        "aria-disabled": true,
      } as any);
    }

    return <>{fallback ?? null}</>;
  }

  return (
    <Button
      {...(rest as BtnProps)}
      aria-disabled={!allowed}
      disabled={!allowed}
    >
      {children}
    </Button>
  );
}

export function PermissionedLink({
  permission,
  any,
  hide,
  fallback,
  to,
  children,
  ...rest
}: PermissionProps & LinkProps & { children: ReactNode }) {
  const { hasPermission, hasAny } = usePermissions();
  const allowed = permission
    ? hasPermission(permission)
    : any
      ? hasAny(any as string[])
      : true;
  const linkShouldHide = hide === undefined ? true : Boolean(hide);

  if (!allowed && linkShouldHide) return <>{fallback ?? null}</>;

  return (
    <Link
      to={to}
      {...rest}
      aria-disabled={!allowed}
      className={!allowed ? "opacity-50 pointer-events-none" : undefined}
    >
      {children}
    </Link>
  );
}
