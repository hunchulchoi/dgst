import { PUBLIC_PRIVACY_CONTACT_EMAIL, PUBLIC_PRIVACY_OPERATOR_NAME } from '$app/env/public';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function load() {
  const configuredEmail = PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ?? '';
  const configuredOperator = PUBLIC_PRIVACY_OPERATOR_NAME?.trim() ?? '';

  return {
    contactEmail: EMAIL_PATTERN.test(configuredEmail) ? configuredEmail : '',
    operatorName: configuredOperator || 'dgst.me 운영자'
  };
}
