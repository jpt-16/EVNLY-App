import { AlertCircle } from "lucide-react";
import { Icon } from "@/components/Icon";

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="error">
      <Icon icon={AlertCircle} size={15} />
      {children}
    </p>
  );
}
