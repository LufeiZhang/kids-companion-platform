import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

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
