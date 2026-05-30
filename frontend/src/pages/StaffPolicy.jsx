/**
 * StaffPolicy — public, printable policy document for Sage Energy staff.
 * Route: /policy  (no login required)
 * Share link with workers; they tap "Print / Save as PDF".
 */
import { useRef } from 'react';
import { Leaf, Printer } from 'lucide-react';

const EFFECTIVE_DATE = 'June 2026';
const COMPANY        = 'Sage Energy & Natural Resources';

export default function StaffPolicy() {
  const printRef = useRef(null);

  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Print styles injected inline ──────────────────────────────────── */}
      <style>{`
        @media print {
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .policy-page { padding: 0 !important; background: white !important; }
          .policy-doc  { box-shadow: none !important; border: none !important;
                         max-width: 100% !important; margin: 0 !important;
                         padding: 32px 40px !important; }
          .page-break  { page-break-before: always; }
        }
        @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
      `}</style>

      <div className="policy-page min-h-screen bg-gray-100 py-8 px-4">

        {/* ── Print button ─────────────────────────────────────────────────── */}
        <div className="no-print max-w-3xl mx-auto mb-4 flex justify-end gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition-colors">
            <Printer size={15} />
            Print / Save as PDF
          </button>
        </div>

        {/* ── Document ─────────────────────────────────────────────────────── */}
        <div ref={printRef}
          className="policy-doc max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-10 text-gray-800 text-sm leading-relaxed">

          {/* Header */}
          <div className="flex items-center gap-4 mb-1">
            <div className="bg-green-700 rounded-xl p-2.5 shrink-0">
              <Leaf size={24} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-green-800 text-lg leading-tight">{COMPANY}</p>
              <p className="text-gray-400 text-xs">Staff Policy Document</p>
            </div>
          </div>

          <div className="border-t-2 border-green-700 mt-4 mb-6" />

          <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
            STAFF POLICY & CONDUCT GUIDELINES
          </h1>
          <p className="text-center text-xs text-gray-400 mb-8">
            Effective: {EFFECTIVE_DATE} · Applies to all staff at all branches
          </p>

          {/* ── 1. Introduction ─────────────────────────────────────────────── */}
          <Section number="1" title="Introduction">
            <p>
              This document outlines the rules, responsibilities, and policies that govern
              all staff employed by <strong>{COMPANY}</strong>. Every member of staff is
              expected to read, understand, and comply with these guidelines. Ignorance of
              this policy will not be accepted as an excuse for non-compliance.
            </p>
            <p className="mt-2">
              These policies are designed to maintain discipline, fairness, and professionalism
              across all our branches. Any breach may result in deductions, suspension, or
              termination of employment.
            </p>
          </Section>

          {/* ── 2. Staff Roles & Responsibilities ──────────────────────────── */}
          <Section number="2" title="Staff Roles & Responsibilities">

            <RoleBlock title="Pump Attendant">
              <li>Attend to customers promptly and courteously at all times.</li>
              <li>Dispense the correct quantity of fuel as requested and paid for.</li>
              <li>Collect correct cash payment and issue receipts where required.</li>
              <li>Report any pump fault, meter irregularity, or suspected theft immediately
                to the supervisor.</li>
              <li>Keep your pump area clean and tidy throughout your shift.</li>
              <li>Never leave your designated pump unattended without the supervisor's permission.</li>
              <li>Account for all cash collected at the end of every shift. Any unaccounted
                amount is your personal liability and will be deducted from your salary.</li>
            </RoleBlock>

            <RoleBlock title="Supervisor / Outside Supervisor">
              <li>Oversee daily station operations and ensure all staff are at their posts.</li>
              <li>Monitor pump attendants and verify that correct quantities and payments
                are being handled.</li>
              <li>Resolve customer complaints promptly and escalate where necessary.</li>
              <li>Ensure all shortages are reported and recorded accurately at the end of
                each shift using the management system.</li>
              <li>Conduct shift handover properly — do not leave without confirming the
                next supervisor is in place.</li>
              <li>Enforce all station policies and report staff misconduct to management.</li>
              <li>Verify clock-in and clock-out records for all staff under your supervision.</li>
            </RoleBlock>

            <RoleBlock title="Security Guard">
              <li>Be present and alert at your post at all times during your shift.</li>
              <li>Control entry and exit of vehicles and persons on station premises.</li>
              <li>Prevent and report any suspicious behaviour, theft, or trespassing.</li>
              <li>Assist in managing queue order and customer conduct.</li>
              <li>Carry out checks on outgoing vehicles where required.</li>
              <li>Do not leave your post without the permission of the supervisor on duty.</li>
            </RoleBlock>

            <RoleBlock title="Cleaner">
              <li>Clean the station premises, forecourt, toilets, and offices daily.</li>
              <li>Ensure waste bins are emptied and waste is properly disposed of.</li>
              <li>Report any maintenance issues (broken equipment, leaks, etc.) to the supervisor.</li>
              <li>Use cleaning materials responsibly and report when stock is low.</li>
              <li>Maintain personal hygiene and wear your uniform while on duty.</li>
            </RoleBlock>

            <RoleBlock title="Maintenance">
              <li>Carry out routine inspection and maintenance of all station equipment.</li>
              <li>Respond to equipment faults reported by supervisors or pump attendants.</li>
              <li>Keep a record of all repairs carried out and parts used.</li>
              <li>Do not carry out any major repair without approval from management.</li>
              <li>Ensure the station generator, pumps, and tanks are in safe working condition.</li>
            </RoleBlock>

          </Section>

          {/* ── 3. Attendance & Clock-In Policy ────────────────────────────── */}
          <Section number="3" title="Attendance & Clock-In / Clock-Out Policy">

            <SubHeading>3.1 — Clock-In & Clock-Out Requirement</SubHeading>
            <p>
              All staff are required to clock in at the start of their shift and clock out
              at the end of their shift using the <strong>attendance terminal</strong>
              provided at the branch. This is mandatory — failure to do so will be treated
              as an absence.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Clock in must be done <strong>personally</strong> — clocking in for another
                staff member is a serious offence and may lead to immediate dismissal.</li>
              <li>You must clock out before leaving the premises at the end of your shift.</li>
              <li>If you are unable to clock in due to a device issue, report it to your
                supervisor immediately and it must be logged on the same day.</li>
            </ul>

            <SubHeading>3.2 — Punctuality</SubHeading>
            <p>
              All staff are expected to arrive at least <strong>5 minutes before</strong>
              their scheduled shift start time. Arriving after the clock-in deadline is
              considered a <strong>late arrival</strong> and will attract a deduction
              as set by management.
            </p>

            <SubHeading>3.3 — Absence & No-Show</SubHeading>
            <p>
              If you are unable to come to work, you must notify your supervisor
              <strong> before your shift starts</strong>. Failure to show up without
              prior notice is a <strong>no-show</strong> and will be treated as an
              unauthorised absence.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Authorised absence (with prior notice): no deduction, subject to management approval.</li>
              <li>Late arrival beyond the set threshold: counted as absent for that day.</li>
              <li>No-show (no clock-in, no notice): automatic salary deduction as set by management.</li>
            </ul>

            <SubHeading>3.4 — Deductions for Attendance Violations</SubHeading>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-2 space-y-1">
              <p className="font-semibold text-amber-800">Attendance Deduction Schedule:</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-amber-100">
                      <th className="text-left py-1.5 px-3 font-semibold text-amber-900 border border-amber-200">Violation</th>
                      <th className="text-left py-1.5 px-3 font-semibold text-amber-900 border border-amber-200">Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1.5 px-3 border border-amber-200">Late arrival (after clock-in deadline)</td>
                      <td className="py-1.5 px-3 border border-amber-200 font-medium">As set per branch by management</td>
                    </tr>
                    <tr className="bg-amber-50">
                      <td className="py-1.5 px-3 border border-amber-200">Absent (arrived after absent threshold)</td>
                      <td className="py-1.5 px-3 border border-amber-200 font-medium">As set per branch by management</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 border border-amber-200">No clock-in / no-show</td>
                      <td className="py-1.5 px-3 border border-amber-200 font-medium">As set per branch by management</td>
                    </tr>
                    <tr className="bg-amber-50">
                      <td className="py-1.5 px-3 border border-amber-200">Early departure before shift end</td>
                      <td className="py-1.5 px-3 border border-amber-200 font-medium">As set per branch by management</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-amber-700 mt-2">
                ⚠ Specific deduction amounts for your branch will be communicated by your supervisor.
                All deductions are automatically recorded and reflected in your monthly salary.
              </p>
            </div>

          </Section>

          {/* ── 4. Shortage Policy ──────────────────────────────────────────── */}
          <Section number="4" title="Shortage Policy">

            <SubHeading>4.1 — What Is a Shortage?</SubHeading>
            <p>
              A shortage occurs when the cash collected from sales at a pump does not match
              the total volume of fuel dispensed multiplied by the selling price. Any
              difference between what was sold and what is accounted for is the
              responsibility of the pump attendant on duty.
            </p>

            <SubHeading>4.2 — Types of Shortage</SubHeading>
            <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
              <li><strong>Cash Shortage</strong> — cash collected is less than the amount expected.</li>
              <li><strong>Fuel Shortage</strong> — fuel dispensed does not match the sales record.</li>
              <li><strong>Equipment Damage</strong> — damage to station property caused by negligence.</li>
            </ul>

            <SubHeading>4.3 — How Shortages Are Recorded</SubHeading>
            <p>
              All shortages are recorded in the management system by the supervisor at the
              end of each shift. The worker's name, the date, the amount, and the type of
              shortage are documented. Shortages are linked directly to your salary and will
              be deducted automatically at the end of the month.
            </p>

            <SubHeading>4.4 — Worker Liability</SubHeading>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-2">
              <ul className="space-y-1.5 ml-1">
                <li className="flex gap-2"><span className="text-red-500 shrink-0">•</span>
                  You are fully responsible for all cash and fuel under your care during your shift.
                </li>
                <li className="flex gap-2"><span className="text-red-500 shrink-0">•</span>
                  Any shortage recorded against you will be <strong>deducted in full</strong> from
                  your monthly salary.
                </li>
                <li className="flex gap-2"><span className="text-red-500 shrink-0">•</span>
                  Repeated shortages may result in suspension or termination.
                </li>
                <li className="flex gap-2"><span className="text-red-500 shrink-0">•</span>
                  If you believe a shortage was recorded in error, report it to your supervisor
                  immediately on the same day — disputes raised after 48 hours may not be accepted.
                </li>
                <li className="flex gap-2"><span className="text-red-500 shrink-0">•</span>
                  Submitting a false shortage or tampering with records is a criminal offence and
                  will result in immediate dismissal and possible prosecution.
                </li>
              </ul>
            </div>

            <SubHeading>4.5 — Self-Reporting Shortages</SubHeading>
            <p>
              If you discover a shortage in your own records, you are encouraged to report
              it yourself via the <strong>staff shortage portal</strong> provided to you.
              Self-reported shortages are treated with consideration; concealed shortages
              discovered later attract an additional penalty.
            </p>

          </Section>

          {/* ── 5. Salary & Deductions ──────────────────────────────────────── */}
          <Section number="5" title="Salary & Deductions">
            <p>
              Your monthly salary is paid after all approved deductions have been applied.
              Deductions include:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Attendance violations (late arrival, absence, no-show, early departure)</li>
              <li>Cash or fuel shortages recorded during the month</li>
              <li>Any damage to company property caused by negligence</li>
            </ul>
            <p className="mt-2">
              A payslip showing your gross salary, total deductions, and net pay is available
              at the end of each month. You are entitled to request a copy from management.
            </p>
          </Section>

          {/* ── 6. General Conduct ──────────────────────────────────────────── */}
          <Section number="6" title="General Conduct">
            <ul className="space-y-2">
              {[
                'Wear your uniform and ID at all times while on duty.',
                'Treat all customers with respect — rude or aggressive behaviour will not be tolerated.',
                'Do not use your mobile phone excessively while attending to customers.',
                'Do not consume alcohol or any substance that impairs your judgement before or during your shift.',
                'Do not remove any company property from the premises without written authorisation.',
                'Report any theft, suspicious activity, or safety hazard to your supervisor immediately.',
                'Maintain cleanliness at your work area throughout your shift.',
                'Do not share your PIN or attendance credentials with any other person.',
              ].map((rule, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="mt-0.5 bg-green-700 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* ── 7. Disciplinary Actions ─────────────────────────────────────── */}
          <Section number="7" title="Disciplinary Actions">
            <p>The following actions may be taken depending on the severity and frequency of a violation:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Level</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Violation</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['1', 'Minor (first offence) — late arrival, untidy uniform', 'Verbal warning + deduction'],
                    ['2', 'Repeated minor offence, unexcused absence', 'Written warning + deduction'],
                    ['3', 'Consistent misconduct, repeated shortage, disobedience', 'Suspension (unpaid)'],
                    ['4', 'Theft, fraud, falsifying records, gross misconduct', 'Immediate dismissal'],
                  ].map(([lvl, v, a], i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                      <td className="py-2 px-3 border border-gray-200 font-bold text-center text-green-700">{lvl}</td>
                      <td className="py-2 px-3 border border-gray-200">{v}</td>
                      <td className="py-2 px-3 border border-gray-200 font-medium">{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Acknowledgement ─────────────────────────────────────────────── */}
          <div className="mt-10 border-t border-gray-200 pt-6">
            <p className="font-semibold text-gray-700 mb-1">Staff Acknowledgement</p>
            <p className="text-xs text-gray-500 mb-6">
              By receiving this policy document, you confirm that you have read, understood,
              and agree to comply with all the rules and guidelines stated above.
            </p>
            <div className="grid grid-cols-2 gap-8 mt-4">
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-500">Staff Full Name</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-500">Signature & Date</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-500">Role / Branch</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-500">Supervisor Signature & Date</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">{COMPANY} · All rights reserved · {EFFECTIVE_DATE}</p>
            <p className="text-[10px] text-gray-400">Confidential — For Staff Use Only</p>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Helper sub-components ────────────────────────────────────────────────────

function Section({ number, title, children }) {
  return (
    <div className="mb-7">
      <h2 className="text-base font-bold text-green-800 mb-3 flex items-center gap-2">
        <span className="bg-green-700 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
          {number}
        </span>
        {title}
      </h2>
      <div className="space-y-2 pl-1">{children}</div>
    </div>
  );
}

function SubHeading({ children }) {
  return (
    <p className="font-semibold text-gray-800 mt-4 mb-1.5 text-sm">{children}</p>
  );
}

function RoleBlock({ title, children }) {
  return (
    <div className="mb-5">
      <p className="font-bold text-gray-900 mb-1.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-600 inline-block shrink-0" />
        {title}
      </p>
      <ul className="list-disc list-inside space-y-1 ml-4 text-gray-700">
        {children}
      </ul>
    </div>
  );
}
