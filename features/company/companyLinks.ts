export const COMPANY_HOME_URL = 'https://allinonemmo.com/'
export const COMPANY_AUTH_URL = 'https://app.allinonemmo.com/'
export const COMPANY_PORTAL_URL = 'https://app.allinonemmo.com/app'
export const COMPANY_CRM_URL = 'https://crm.allinonemmo.com/'

export type CompanyLoginDestination = 'app' | 'crm'

export function companyLoginUrl(destination: CompanyLoginDestination = 'app') {
  const url = new URL('/login', COMPANY_AUTH_URL)
  url.searchParams.set('destination', destination)
  return url.toString()
}

export function companyRegisterUrl(destination: CompanyLoginDestination = 'app') {
  const url = new URL('/register', COMPANY_AUTH_URL)
  url.searchParams.set('destination', destination)
  return url.toString()
}

export function companyLogoutUrl() {
  return new URL('/logout', COMPANY_AUTH_URL).toString()
}

export function companyCrmLogoutUrl() {
  return new URL('/logout', COMPANY_CRM_URL).toString()
}
