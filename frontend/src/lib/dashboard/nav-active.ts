export interface NavItemLike {
  href: string;
  label?: string;
}

export function isNavItemActive(pathname: string, item: NavItemLike): boolean {
  if (pathname === item.href) return true;
  return item.label === 'Host Stand' && pathname.endsWith('/dashboard');
}
