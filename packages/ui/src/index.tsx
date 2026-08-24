import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Language = "zh" | "en";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function EmptyState({ icon, title, children }: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3>{children}</div>;
}

export function LanguageSwitcher({ language, onChange, className = "" }: {
  language: Language;
  onChange(language: Language): void;
  className?: string;
}) {
  return (
    <div className={`language-switcher ${className}`} data-i18n-skip>
      <button type="button" className={language === "zh" ? "active" : ""} onClick={() => onChange("zh")}>中文</button>
      <button type="button" className={language === "en" ? "active" : ""} onClick={() => onChange("en")}>English</button>
    </div>
  );
}
