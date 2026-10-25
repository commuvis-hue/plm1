'use client';
import { useEffect } from 'react';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const tone = {
  승인: 'ok', 체결: 'ok', 적용: 'ok', 완료: 'ok',
  작업중: 'muted', 요청: 'muted', 대기: 'muted',
  검토중: 'warn', 검토: 'warn', '서명 대기': 'warn', '수량 변경': 'warn',
  반려: 'bad', 폐기: 'bad', 삭제: 'bad',
  추가: 'info', 동일: 'muted',
};
export const Badge = ({ children }) => (
  <span className={'badge ' + (tone[children] || 'muted')}>{children}</span>
);

export const Empty = ({ children, action }) => (
  <div className="empty">
    <p>{children}</p>
    {action}
  </div>
);

export function PageHead({ title, desc, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k}
          className={value === k ? 'tab on' : 'tab'} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
