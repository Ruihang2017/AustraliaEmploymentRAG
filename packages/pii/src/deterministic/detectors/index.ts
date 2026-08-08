/**
 * EVID-01 — the detector registry.
 *
 * One entry per detector module. `detect.ts` runs every entry over every scanned field; nothing
 * chooses a subset, and there is no flag, option or environment lookup that could disable one. A
 * detector is added by adding a file and a line here, which is also what makes the count assertable
 * in `test/deterministic/evasions.test.ts`.
 */
import type { Detector } from './shared.js';
import { detectAddressIn } from './address.js';
import { detectBankOrCardIn } from './bank-or-card.js';
import { detectDateOfBirthIn } from './date-of-birth.js';
import { detectDriverLicenceIn } from './driver-licence.js';
import { detectEmailIn } from './email.js';
import { detectEmployeeOrPayrollIdIn } from './employee-or-payroll-id.js';
import { detectLabelledNameIn } from './labelled-name.js';
import { detectMedicareIn } from './medicare.js';
import { detectPassportIn } from './passport.js';
import { detectPayslipOrPersonnelExtractIn } from './payslip-or-personnel-extract.js';
import { detectPhoneIn } from './phone.js';
import { detectSocialIdentifierIn } from './social-identifier.js';
import { detectTfnIn } from './tfn.js';
import { detectAbnIn } from './abn.js';

export interface RegisteredDetector {
  readonly name: string;
  readonly detect: Detector;
}

export const DETECTORS: readonly RegisteredDetector[] = Object.freeze([
  { name: 'tfn', detect: detectTfnIn },
  { name: 'abn', detect: detectAbnIn },
  { name: 'medicare', detect: detectMedicareIn },
  { name: 'bankOrCard', detect: detectBankOrCardIn },
  { name: 'email', detect: detectEmailIn },
  { name: 'phone', detect: detectPhoneIn },
  { name: 'passport', detect: detectPassportIn },
  { name: 'driverLicence', detect: detectDriverLicenceIn },
  { name: 'dateOfBirth', detect: detectDateOfBirthIn },
  { name: 'employeeOrPayrollId', detect: detectEmployeeOrPayrollIdIn },
  { name: 'payslipOrPersonnelExtract', detect: detectPayslipOrPersonnelExtractIn },
  { name: 'labelledName', detect: detectLabelledNameIn },
  { name: 'address', detect: detectAddressIn },
  { name: 'socialIdentifier', detect: detectSocialIdentifierIn },
].map((entry) => Object.freeze(entry)));

export type { Detector, PublicDetector } from './shared.js';
export { asPublicDetector, findingAt, hasContextBefore, CONTEXT_WINDOW } from './shared.js';
export { isValidAbn, isValidLuhn, isValidMedicare, isValidTfn } from './checksums.js';
export { detectAddress } from './address.js';
export { detectBankOrCard } from './bank-or-card.js';
export { detectDateOfBirth } from './date-of-birth.js';
export { detectDriverLicence, DRIVER_LICENCE_FORMATS } from './driver-licence.js';
export { detectEmail } from './email.js';
export { detectEmployeeOrPayrollId } from './employee-or-payroll-id.js';
export { detectLabelledName } from './labelled-name.js';
export { detectMedicare } from './medicare.js';
export { detectPassport } from './passport.js';
export { detectPayslipOrPersonnelExtract } from './payslip-or-personnel-extract.js';
export { detectPhone } from './phone.js';
export { detectSocialIdentifier } from './social-identifier.js';
export { detectTfn } from './tfn.js';
export { detectAbn } from './abn.js';
