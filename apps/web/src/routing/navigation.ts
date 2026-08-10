export interface NavigationOptions {
  preserveScroll?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
