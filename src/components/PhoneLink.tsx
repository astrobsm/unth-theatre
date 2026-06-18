'use client';

import { MessageCircle } from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

interface PhoneLinkProps {
  phone: string | null | undefined;
  /** Optional pre-filled WhatsApp message (e.g. to share a link). */
  message?: string;
  /** Text to show. Defaults to the phone number itself. */
  label?: string;
  className?: string;
  /** Show the WhatsApp icon before the number. Default true. */
  showIcon?: boolean;
  /** Fallback text/markup when there is no valid number. */
  fallback?: React.ReactNode;
}

/**
 * Renders a phone number as a WhatsApp click-to-chat link. Clicking opens
 * WhatsApp (app or web) so users can call, message, and share links/media.
 * Numbers are normalised to international format (defaults to +234 Nigeria).
 */
export default function PhoneLink({
  phone,
  message,
  label,
  className = '',
  showIcon = true,
  fallback = null,
}: PhoneLinkProps) {
  const href = whatsappChatLink(phone, message);
  if (!href) return <>{fallback}</>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-green-700 hover:text-green-800 hover:underline ${className}`}
    >
      {showIcon && <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      <span>{label ?? phone}</span>
    </a>
  );
}
