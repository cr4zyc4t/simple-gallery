import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  );
}

export const GridIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Base>
);

export const ListIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Base>
);

export const FolderIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </Base>
);

export const FolderPlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <path d="M12 11.5v5M9.5 14h5" />
  </Base>
);

export const ImageIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.2-4.2a2 2 0 0 1 2.8 0l2.3 2.3 1.7-1.6a2 2 0 0 1 2.8 0l2.2 2.1" />
  </Base>
);

export const TrashIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12A1.5 1.5 0 0 0 8.8 20.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10.5 11v5.5M13.5 11v5.5" />
  </Base>
);

export const DownloadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 4v10.5m0 0 3.8-3.8M12 14.5 8.2 10.7M4.5 17v2.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V17" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Base>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Base>
);

export const ChevronUpIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5.5 14.5 12 8l6.5 6.5" />
  </Base>
);

export const SortAscIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h10M4 12h7M4 17h4M17 6v12m0 0-3-3m3 3 3-3" />
  </Base>
);

export const SortDescIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h4M4 12h7M4 17h10M17 18V6m0 0-3 3m3-3 3 3" />
  </Base>
);

export const HomeIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    <path d="M9.5 20.5v-6h5v6" />
  </Base>
);

export const MenuIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Base>
);

export const SpinnerIcon = (props: IconProps) => (
  <Base {...props} className={`animate-spin ${props.className ?? ""}`}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </Base>
);

export const AlertIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Base>
);

export const RefreshIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 11.5A8 8 0 1 0 18 17M20 5v6h-6" />
  </Base>
);

export const KeyboardIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h12" />
  </Base>
);

export const CheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m5 12.5 4.4 4.4L19 7.3" />
  </Base>
);

export const CheckSquareIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path d="m8 12.2 2.7 2.7L16.4 9" />
  </Base>
);

export const ZoomOutIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.4 15.4 21 21M7.8 10.5h5.4" />
  </Base>
);

export const ChevronsUpIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 13 6-6 6 6" />
    <path d="m6 18.5 6-6 6 6" />
  </Base>
);
