/**
 * WorkerHandbook — simple, plain-English staff rules & understanding document.
 * Route: /handbook  (public — no login required)
 * Actions: Print / Save as PDF · Copy Text
 */
import { useState, useRef } from 'react';
import { Leaf, Printer, Copy, CheckCircle, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

const COMPANY      = 'Sage Energy & Natural Resources';
const DATE_PRINTED = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

/* ─── tiny helpers ──────────────────────────────────────────────────────── */
function Section({ id, emoji, title, children }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-lg font-black text-gray-900 mb-3 flex items-center gap-2 border-b-2 border-green-600 pb-2">
        <span>{emoji}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="font-bold text-gray-800 text-sm mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Rule({ children }) {
  return <p className="text-gray-700 text-sm mb-2 leading-relaxed">{children}</p>;
}

function Example({ children }) {
  return (
    <div className="bg-green-50 border-l-4 border-green-500 px-4 py-2.5 rounded-r-lg my-3">
      <p className="text-green-900 text-sm"><span className="font-bold">📌 Example: </span>{children}</p>
    </div>
  );
}

function Warning({ children }) {
  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 px-4 py-2.5 rounded-r-lg my-3">
      <p className="text-amber-900 text-sm"><span className="font-bold">⚠️ Important: </span>{children}</p>
    </div>
  );
}

function Deduction({ title, children }) {
  return (
    <div className="mb-4 border border-red-100 rounded-xl p-4 bg-red-50">
      <p className="font-bold text-red-700 text-sm mb-1">🔴 {title}</p>
      <p className="text-gray-700 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="list-none space-y-1.5 my-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="text-green-600 mt-0.5 shrink-0">✓</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BreakCard({ title, duration, window_, emoji }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-3">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div>
        <p className="font-bold text-gray-900 text-sm">{title}</p>
        <p className="text-sm text-gray-600">Duration: <span className="font-semibold text-green-700">{duration}</span></p>
        {window_ && <p className="text-xs text-gray-400 mt-0.5">Window: {window_}</p>}
      </div>
    </div>
  );
}

/* ─── Table of Contents (screen only) ───────────────────────────────────── */
const TOC = [
  { id: 'attendance',       label: '📋 Attendance & Clock In/Out' },
  { id: 'breaks',           label: '☕ Break System' },
  { id: 'restroom',         label: '🚻 Restroom Breaks' },
  { id: 'deductions',       label: '💰 What Can Cause Deduction?' },
  { id: 'verification',     label: '🪪 Worker Verification' },
  { id: 'transfer',         label: '🔄 Branch Transfer' },
  { id: 'suspension',       label: '⏸️ Suspension' },
  { id: 'dismissal',        label: '❌ Sack / Dismissal' },
  { id: 'status',           label: '✅ Active Worker Status' },
  { id: 'responsibilities', label: '🤝 Your Responsibilities' },
  { id: 'rules',            label: '📜 Company Rules' },
];

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function WorkerHandbook() {
  const [copied,   setCopied  ] = useState(false);
  const [showToc,  setShowToc ] = useState(false);
  const docRef = useRef(null);

  const handlePrint = () => window.print();

  const handleCopy = async () => {
    const text = docRef.current?.innerText || '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* silent */
    }
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShowToc(false);
  };

  return (
    <>
      {/* ── Print / PDF styles ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body { margin: 0; background: white; font-size: 11pt; }
          .no-print  { display: none !important; }
          .hb-page   { padding: 0 !important; background: white !important; }
          .hb-doc    { box-shadow: none !important; border: none !important;
                       max-width: 100% !important; margin: 0 !important;
                       padding: 24px 36px !important; border-radius: 0 !important; }
          .page-break{ page-break-before: always; }
          section    { margin-bottom: 24pt !important; }
          h2         { font-size: 13pt !important; margin-bottom: 8pt !important; }
          h3         { font-size: 11pt !important; }
          p, li      { font-size: 10pt !important; line-height: 1.55 !important; }
          .break-grid{ display: grid !important; grid-template-columns: repeat(3,1fr) !important; gap: 8pt !important; }
        }
        @page { size: A4; margin: 18mm 15mm 22mm 15mm; }
        @page :right { @bottom-right { content: "Page " counter(page); font-size: 9pt; } }
        @page :left  { @bottom-left  { content: "Page " counter(page); font-size: 9pt; } }
      `}</style>

      <div className="hb-page min-h-screen bg-gray-50 py-8 px-4">

        {/* ── Toolbar (screen only) ─────────────────────────────────────────── */}
        <div className="no-print max-w-3xl mx-auto mb-4 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-green-700" />
            <span className="font-bold text-gray-700 text-sm">Worker Rules &amp; Understanding</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Table of Contents toggle */}
            <div className="relative">
              <button onClick={() => setShowToc(v => !v)}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-colors">
                Contents {showToc ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showToc && (
                <div className="absolute left-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 py-2 overflow-hidden">
                  {TOC.map(t => (
                    <button key={t.id} onClick={() => scrollTo(t.id)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 text-gray-700 hover:text-green-800 transition-colors border-b border-gray-50 last:border-0">
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition-colors">
              {copied ? <><CheckCircle size={13} className="text-green-600" /> Copied!</> : <><Copy size={13} /> Copy Text</>}
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition-colors">
              <Printer size={13} /> Download / Print PDF
            </button>
          </div>
        </div>

        {/* ── Document ─────────────────────────────────────────────────────── */}
        <div ref={docRef}
          className="hb-doc max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-10 text-gray-800">

          {/* Cover / Header */}
          <div className="flex items-start gap-4 mb-2">
            <div className="bg-green-700 rounded-2xl p-3 shrink-0">
              <Leaf size={28} className="text-white" />
            </div>
            <div>
              <p className="text-green-700 font-black text-base">{COMPANY}</p>
              <h1 className="text-2xl font-black text-gray-900 leading-tight">Worker Rules &amp; Understanding</h1>
              <p className="text-xs text-gray-400 mt-1">
                Prepared: {DATE_PRINTED} &nbsp;·&nbsp; All workers must read and understand this document
              </p>
            </div>
          </div>

          <div className="bg-green-700 h-1 rounded-full my-6" />

          {/* Introduction */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 mb-8">
            <p className="text-green-900 font-bold text-sm mb-1">📖 What is this document?</p>
            <p className="text-green-800 text-sm leading-relaxed">
              This is your worker handbook. It explains all the rules at {COMPANY} in simple language.
              Read it carefully. If you have any question, ask your supervisor.
              This document covers how to clock in, how breaks work, what can reduce your salary,
              what happens when you are absent, and your rights and responsibilities as a worker.
            </p>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="attendance" emoji="📋" title="Attendance — Clock In and Clock Out">

            <SubSection title="What Is Attendance?">
              <Rule>
                Attendance means you coming to work every day you are supposed to.
                Every time you come to work, you must <strong>clock in</strong> using the attendance device (a phone or tablet at your station).
                When you leave at the end of your shift, you must <strong>clock out</strong>.
              </Rule>
              <Rule>
                The system records the exact time you clock in and clock out every day.
                Your manager can see this record. It affects your salary.
              </Rule>
            </SubSection>

            <SubSection title="How to Clock In">
              <BulletList items={[
                'Go to the attendance device at your station.',
                'Enter your 4-digit PIN.',
                'The system will confirm your face (you look at the camera).',
                'If your face matches, it records "Clock In" with the exact time.',
                'You will see a green screen that says "Clock In Successful".',
              ]} />
              <Example>
                Amaka arrives at work at 7:05 am. She enters her PIN on the device,
                looks at the camera, and the system records her clock-in at 7:05 am.
              </Example>
            </SubSection>

            <SubSection title="How to Clock Out">
              <BulletList items={[
                'At the end of your shift, go back to the attendance device.',
                'Enter your 4-digit PIN again.',
                'Look at the camera for face check.',
                'The system records your clock-out time.',
              ]} />
              <Warning>
                Do NOT leave work without clocking out. If you forget to clock out,
                the system will record that you are still on duty. This can cause confusion
                with your salary and attendance record.
              </Warning>
            </SubSection>

            <SubSection title="What Is the Clock-In Deadline?">
              <Rule>
                Your station has a set time by which you must clock in. This is called the <strong>Clock-In Deadline</strong>.
                If you clock in after this time, it is recorded as <strong>Late Arrival</strong>.
                Late arrival leads to a deduction from your salary.
              </Rule>
              <Example>
                The clock-in deadline at your station is 7:00 am. If you arrive and clock in at 7:20 am,
                the system will mark you as late and a deduction will be applied automatically.
              </Example>
            </SubSection>

            <SubSection title="What Is the Absent Threshold?">
              <Rule>
                If you clock in very late — past the <strong>Absent Threshold</strong> time — the system
                will treat you as <strong>Absent</strong> even though you came in. This means a higher deduction
                applies to your salary.
              </Rule>
              <Example>
                The absent threshold is 9:00 am. If you clock in at 9:30 am, you will be recorded
                as "Absent" even though you came to work. This carries a bigger deduction.
              </Example>
            </SubSection>

            <SubSection title="No Clock-In (Did Not Come to Work)">
              <Rule>
                If you do not come to work at all and there is no clock-in record for you, your manager can
                process your absence. This will also result in a salary deduction.
              </Rule>
              <Warning>
                If you cannot come to work, inform your supervisor ahead of time.
                Unannounced absence without permission is a serious matter.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <Section id="breaks" emoji="☕" title="Break System — How Your Breaks Work">

            <Rule>
              Every worker is allowed to take scheduled breaks during the day.
              There are up to three types of breaks — Morning, Afternoon, and Night.
              Your station manager decides which breaks apply and how long each one lasts.
            </Rule>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 break-grid">
              <BreakCard emoji="🌅" title="Morning Break"    duration="5 – 10 minutes" window_="Within morning window" />
              <BreakCard emoji="☀️"  title="Afternoon Break"  duration="10 minutes"     window_="Within afternoon window" />
              <BreakCard emoji="🌙" title="Night Break"      duration="5 – 10 minutes" window_="Within night window" />
            </div>

            <Warning>
              Breaks are only available during their set time window.
              If you miss the window, the break will be marked as <strong>Missed</strong>.
            </Warning>

            <SubSection title="How to Start a Break">
              <BulletList items={[
                'Go to the attendance device.',
                'Enter your PIN.',
                'The device will ask you to look at the camera (face check).',
                'After your face is confirmed, the system starts recording your break.',
                'You will see the break type and how many minutes you have left.',
              ]} />
              <Example>
                Chukwu wants to take his afternoon break. He goes to the device,
                enters his PIN, looks at the camera, and the system records "Break Started — 12:35 pm — 10 minutes allowed."
              </Example>
            </SubSection>

            <SubSection title="How to End a Break (Return to Work)">
              <BulletList items={[
                'When you come back from your break, go back to the device.',
                'Enter your PIN and do the face check again.',
                'The system will record the time you returned.',
                'It will show how long your break was and if you stayed within the allowed time.',
              ]} />
            </SubSection>

            <SubSection title="What Happens If You Stay Longer Than Allowed?">
              <Rule>
                If you do not return from your break on time, the system will detect this automatically.
                This is called an <strong>Overstayed Break</strong>.
                The extra minutes you spent will be recorded, and a deduction may be made from your salary.
              </Rule>
              <Example>
                Your break is 10 minutes. You start your break at 12:35 pm.
                You return at 12:50 pm — that is 15 minutes. You stayed 5 minutes too long.
                The system will record "5 minutes overstay" and a deduction will be applied.
              </Example>
              <Warning>
                Even if you forget, the system keeps running in the background.
                After about 30 minutes, the system will automatically end your break
                and calculate how many extra minutes you stayed.
              </Warning>
            </SubSection>

            <SubSection title="What Happens If You Miss a Break?">
              <Rule>
                If the break window closes and you never started your break, the system
                will record a <strong>Missed Break</strong> for you.
                Depending on how your station is set up, a small deduction may apply for missed breaks.
              </Rule>
              <Example>
                The morning break window is 8:00 am – 10:30 am. If you never take your break
                and the window closes at 10:30 am, the system records "Morning Break — Missed."
              </Example>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="restroom" emoji="🚻" title="Restroom Breaks — When You Need to Use the Toilet">

            <Rule>
              Apart from your regular breaks, you are allowed to take a short <strong>Restroom Break</strong>
              when you need to use the toilet. This is a separate, unlimited trip.
            </Rule>

            <SubSection title="How Restroom Breaks Work">
              <BulletList items={[
                'Go to the attendance device and select "Restroom Break".',
                'Enter your PIN and do the face check.',
                'The system records the time you left.',
                'When you come back, do the same thing to end your restroom break.',
                'You are allowed a set number of free minutes (usually 2 minutes).',
              ]} />
              <Example>
                You press "Restroom Break" at 2:15 pm. You are given 2 free minutes.
                You come back at 2:17 pm — that is exactly 2 minutes. No deduction.
              </Example>
            </SubSection>

            <SubSection title="What Happens If You Stay Too Long in the Restroom?">
              <Rule>
                If you spend more than the allowed time, the system will deduct money from your salary
                for every extra minute you stayed. The rate is set by your station management.
              </Rule>
              <Example>
                You are allowed 2 minutes. You stay for 7 minutes.
                That is 5 extra minutes. If the deduction rate is ₦500 per minute,
                the system will deduct ₦2,500 from your salary automatically.
              </Example>
              <Warning>
                If you do not come back at all after your restroom break, the system will
                automatically end your break after 30 minutes and deduct the full excess amount.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <Section id="deductions" emoji="💰" title="What Can Cause Deduction From Your Salary?">

            <Rule>
              A <strong>deduction</strong> means money is removed from your salary before you are paid.
              Below are the things that can cause a deduction. Read them carefully.
            </Rule>

            <Deduction title="1. Late Coming (Late Arrival)">
              If you come to work after the clock-in deadline, the system records you as late.
              A fixed amount is deducted from your salary for that day.
              The amount depends on your station setting.
              <br /><br />
              <em>Example: Your deadline is 7:00 am. You arrive at 7:25 am → Late arrival deduction.</em>
            </Deduction>

            <Deduction title="2. Absence from Work (No Clock-In)">
              If you do not come to work and there is no clock-in record, your supervisor can
              process your absence. A deduction will be applied for that day.
              <br /><br />
              <em>Example: You do not come to work on Monday, and you did not inform anyone. A no-show deduction is created.</em>
            </Deduction>

            <Deduction title="3. Sales Shortage">
              If there is a gap between the money you collected and the money you were supposed to collect,
              this is called a <strong>Sales Shortage</strong>. The shortage amount is recorded,
              and a penalty deduction is automatically added to your salary.
              <br /><br />
              <em>
                Example: You were supposed to collect ₦50,000 from sales but only ₦35,000 is found.
                The ₦15,000 difference is a shortage. Because ₦15,000 is above the ₦10,000 threshold,
                a penalty of ₦5,000 is deducted. If the shortage was below ₦10,000, the penalty would be ₦2,000.
              </em>
            </Deduction>

            <Deduction title="4. Unauthorized Break Extension (Break Overstay)">
              If you stay on your break longer than the time allowed, the extra minutes are recorded
              and a deduction is applied.
              <br /><br />
              <em>Example: Break is 10 minutes. You return after 18 minutes — 8 minutes overstay → deduction.</em>
            </Deduction>

            <Deduction title="5. Restroom Overstay">
              If you spend more than the allowed free minutes in the restroom, you are charged
              per every extra minute you stayed.
              <br /><br />
              <em>Example: 2 free minutes. You stayed 10 minutes — 8 extra minutes × ₦500/min = ₦4,000 deducted.</em>
            </Deduction>

            <Deduction title="6. Equipment Damage (Damage by Negligence)">
              If you cause damage to company property through carelessness, you may be required
              to pay for the repair or replacement. This will be deducted from your salary.
              <br /><br />
              <em>Example: You are using a pump and you break a nozzle due to rough handling. The repair cost may be charged to you.</em>
            </Deduction>

            <Deduction title="7. Customer Complaint">
              If a customer makes a formal complaint against you and the investigation shows
              you were at fault, a penalty deduction may be applied.
            </Deduction>

            <Deduction title="8. Early Departure (Leaving Before End of Shift)">
              If you clock out before your shift is supposed to end without permission,
              the system records this as an early departure. A deduction may apply.
            </Deduction>

            <Deduction title="9. Other Approved Deductions">
              Management may approve other deductions from time to time based on investigations,
              disciplinary outcomes, or other approved reasons.
              You will always be informed before any such deduction.
            </Deduction>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <Section id="verification" emoji="🪪" title="Worker Verification — Why We Collect Your Documents">

            <Rule>
              When you join {COMPANY}, we collect some documents and information from you.
              This is called <strong>Verification</strong>. It is done to protect you, your colleagues, and the company.
            </Rule>

            <SubSection title="Why We Collect Your ID Card">
              <Rule>
                We collect a valid government ID (National ID, Voter's Card, Driver's License, or International Passport)
                to confirm that you are who you say you are. This protects the company from fraud
                and also protects you by making sure no one else uses your name.
              </Rule>
              <BulletList items={[
                'Your ID confirms your full name and date of birth.',
                'It is stored securely and will not be shared with anyone outside the company.',
                'You must provide a valid, unexpired ID.',
              ]} />
            </SubSection>

            <SubSection title="Why We Take Your Photograph and Fingerprint">
              <Rule>
                Your photograph and face data are used for the attendance system.
                Every time you clock in or start a break, the device checks your face
                to make sure it is really you — not someone else using your PIN.
              </Rule>
              <Example>
                If someone else tries to clock in with your PIN, the face check will fail
                because their face does not match yours. This protects you from someone
                collecting your attendance on your behalf.
              </Example>
            </SubSection>

            <SubSection title="Why a Guarantor is Required">
              <Rule>
                A <strong>Guarantor</strong> is a person who vouches for you — someone who says
                "I know this person and I stand for them." We require a guarantor because:
              </Rule>
              <BulletList items={[
                'You will handle cash, fuel, and equipment every day.',
                'The guarantor confirms you are a responsible person.',
                'If there is a serious financial issue and it cannot be resolved, the guarantor may be contacted.',
                'The guarantor must be a responsible adult with a verifiable address and contact.',
              ]} />
              <Warning>
                Your guarantor does not pay your salary deductions for you.
                They are a character reference who confirms you are trustworthy.
                However, in cases of serious fraud or theft, they may be contacted by management.
              </Warning>
            </SubSection>

            <SubSection title="Why We Do House Verification">
              <Rule>
                House verification means a representative of the company may visit your home address
                to confirm that the address you gave us is correct.
              </Rule>
              <BulletList items={[
                'This is a standard security check done for all workers.',
                'It confirms you live where you said you live.',
                'It is NOT a punishment — it is done for every worker.',
                'Give the correct home address when you are registered.',
              ]} />
              <Example>
                Emeka writes his home address as "45 Adesuwa Road, Benin City."
                A company representative visits to confirm he lives there.
                If the address is wrong or nobody knows him there, his registration may be put on hold.
              </Example>
            </SubSection>

            <SubSection title="Why We Collect Your Signature">
              <Rule>
                Your signature on documents means you have read, understood, and agreed to what is written.
                We collect your signature on:
              </Rule>
              <BulletList items={[
                'Your employment agreement (the paper that shows your job terms).',
                'Your guarantor form.',
                'Any disciplinary document or query letter.',
                'Any salary deduction document.',
              ]} />
              <Warning>
                Do not sign any document you have not read or do not understand.
                Ask your supervisor to explain it to you before you sign.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="transfer" emoji="🔄" title="Branch Transfer — Moving to Another Station">

            <Rule>
              A <strong>Branch Transfer</strong> means you are moved from one fuel station (branch)
              to another by the company. This can happen for several reasons.
            </Rule>

            <SubSection title="Reasons for Transfer">
              <BulletList items={[
                'The company needs more workers at another station.',
                'You requested a transfer closer to your home.',
                'Your role is better suited at a different branch.',
                'Disciplinary reasons in extreme cases.',
              ]} />
            </SubSection>

            <SubSection title="What Happens During a Transfer">
              <BulletList items={[
                'You will be informed officially by your supervisor or manager.',
                'Your records, salary, and attendance history move with you.',
                'Your new branch rules may be slightly different — learn them when you arrive.',
                'Your PIN and face ID will still work at the new branch.',
              ]} />
              <Warning>
                Never refuse a transfer without first discussing it with your manager.
                Refusing a legitimate transfer without reason may be treated as insubordination.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="suspension" emoji="⏸️" title="Suspension — Temporary Stop from Work">

            <Rule>
              A <strong>Suspension</strong> means you are temporarily stopped from coming to work.
              It is not a sack — it is a pause while an investigation is happening or while
              management decides on a disciplinary matter.
            </Rule>

            <SubSection title="What Happens During Suspension">
              <BulletList items={[
                'You are told officially that you are suspended.',
                'You must not come to the station during your suspension unless called.',
                'Your records will be marked as "Suspended" in the system.',
                'Depending on the type of suspension, you may or may not be paid during this period.',
                'After investigation, you may return to work, be transferred, or be dismissed.',
              ]} />
              <Warning>
                If you are suspended and you come to the station without permission,
                it may worsen your situation and make dismissal more likely.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="dismissal" emoji="❌" title="Sack / Dismissal — When You Are Let Go">

            <Rule>
              <strong>Dismissal</strong> means your employment with {COMPANY} has ended.
              This is sometimes called being <strong>"sacked"</strong>.
              It can happen for serious reasons or after repeated warnings.
            </Rule>

            <SubSection title="Reasons That Can Lead to Dismissal">
              <BulletList items={[
                'Theft of company money, fuel, or property.',
                'Serious dishonesty or fraud.',
                'Repeated absence without permission or explanation.',
                'Serious misconduct (fighting, assault, harassment).',
                'Deliberately damaging company property.',
                'Repeatedly refusing to follow legitimate instructions.',
                'Giving false information during employment.',
              ]} />
            </SubSection>

            <SubSection title="How Dismissal Happens">
              <Rule>
                Before you are dismissed, there is usually a process:
              </Rule>
              <BulletList items={[
                'You receive a query letter explaining the issue against you.',
                'You are given a chance to respond (write or speak in your defense).',
                'Management reviews the situation.',
                'If the decision is dismissal, you will be officially informed.',
                'Your employment status in the system will be changed to "Dismissed".',
              ]} />
              <Warning>
                In cases of theft or serious fraud that is proven, dismissal may happen
                immediately without the normal warning process.
              </Warning>
            </SubSection>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <Section id="status" emoji="✅" title="Active Worker Status — What It Means">

            <Rule>
              When your records show you are <strong>"Active"</strong>, it means you are currently
              a working employee of {COMPANY}. Your salary is processed, your attendance is tracked,
              and you can use all the features of the system.
            </Rule>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
              {[
                { status: 'Active',      color: 'bg-green-100 border-green-300 text-green-800', desc: 'You are a current working employee. Everything is normal.' },
                { status: 'Suspended',   color: 'bg-amber-100 border-amber-300 text-amber-800', desc: 'You are temporarily stopped from work pending investigation.' },
                { status: 'Dismissed',   color: 'bg-red-100 border-red-300 text-red-800',       desc: 'Your employment has ended. You can no longer work here.' },
                { status: 'Transferred', color: 'bg-blue-100 border-blue-300 text-blue-800',    desc: 'You have been moved to a different branch.' },
              ].map(s => (
                <div key={s.status} className={`rounded-xl p-3 border ${s.color}`}>
                  <p className="font-bold text-sm">{s.status}</p>
                  <p className="text-xs mt-0.5">{s.desc}</p>
                </div>
              ))}
            </div>

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="responsibilities" emoji="🤝" title="Your Responsibilities as a Worker">

            <Rule>
              As a worker at {COMPANY}, these are your duties and responsibilities. Follow them every day.
            </Rule>

            <BulletList items={[
              'Come to work on time every day you are scheduled to work.',
              'Clock in when you arrive and clock out when you leave. Do not forget either one.',
              'Only start your break during the allowed break window.',
              'Return from breaks on time — the system is watching and records are automatic.',
              'Handle all cash, fuel, and equipment with care.',
              'Report any money shortage or discrepancy immediately to your supervisor.',
              'Treat every customer with respect and provide good service.',
              'Keep your 4-digit PIN secret. Do not give it to anyone.',
              'Never allow someone else to clock in on your behalf using your PIN.',
              'Report any problem with the attendance device to your supervisor.',
              'Wear your uniform neatly and maintain personal hygiene.',
              'Follow all safety rules at the fuel station.',
              'Do not use your phone while actively serving customers.',
              'Report any suspicious activity at the station to your supervisor immediately.',
              'Keep your personal information (address, phone number) up to date with management.',
            ]} />

          </Section>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          <Section id="rules" emoji="📜" title="Company Rules — What You Must Follow">

            <SubSection title="Rule 1 — Honesty">
              <Rule>
                Be honest in everything — with money, with customers, and with your supervisors.
                Dishonesty is the fastest way to lose your job at {COMPANY}.
              </Rule>
            </SubSection>

            <SubSection title="Rule 2 — Punctuality">
              <Rule>
                Always arrive on time. Late coming affects not just your salary but also your
                colleagues who may have to cover for you. Respect everyone's time.
              </Rule>
            </SubSection>

            <SubSection title="Rule 3 — Respect">
              <Rule>
                Treat every customer, colleague, and supervisor with respect at all times.
                Fighting, shouting, or using abusive language at work is not tolerated.
              </Rule>
            </SubSection>

            <SubSection title="Rule 4 — Care for Company Property">
              <Rule>
                Handle all pumps, machines, cash, and equipment carefully.
                Report any damage or malfunction to your supervisor immediately —
                do not try to hide or fix it yourself without permission.
              </Rule>
            </SubSection>

            <SubSection title="Rule 5 — Confidentiality">
              <Rule>
                Do not share information about the company's earnings, records, or
                internal matters with people outside the company.
                What happens at {COMPANY} stays at {COMPANY}.
              </Rule>
            </SubSection>

            <SubSection title="Rule 6 — Safety First">
              <Rule>
                Fuel is dangerous. Do not smoke, light a fire, or use a naked flame anywhere
                near the fuel station. Follow all safety instructions at all times.
                If you see a safety risk, report it immediately.
              </Rule>
            </SubSection>

            <SubSection title="Rule 7 — Mobile Phone Policy">
              <Rule>
                Using your phone while serving a customer is not allowed.
                You may use your phone during your break. But do not let your phone
                distract you from your duties.
              </Rule>
            </SubSection>

            <SubSection title="Rule 8 — Follow Your Supervisor's Instructions">
              <Rule>
                Always follow the lawful instructions of your supervisor.
                If you disagree with an instruction, speak about it calmly and respectfully
                after you have followed it — not in the middle of work.
              </Rule>
            </SubSection>

            <SubSection title="Rule 9 — Report Shortages Immediately">
              <Rule>
                If at the end of your shift you find that there is a money shortage,
                do not hide it. Report it immediately to your supervisor.
                The longer you wait, the more it looks like you knew and tried to hide it.
              </Rule>
              <Example>
                Bisi counted the cash after her shift and found ₦4,000 missing.
                She told her supervisor immediately. Because she reported it on time,
                the investigation was handled properly and fairly.
              </Example>
            </SubSection>

            <SubSection title="Rule 10 — Absence and Leave">
              <Rule>
                If you cannot come to work, inform your supervisor by phone or text
                as early as possible — before your shift starts if you can.
                Unannounced repeated absence will lead to disciplinary action.
              </Rule>
            </SubSection>

          </Section>

          {/* ─── Footer ─────────────────────────────────────────────────────── */}
          <div className="bg-green-700 h-1 rounded-full my-8" />
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="bg-green-700 rounded-xl p-1.5">
                <Leaf size={16} className="text-white" />
              </div>
              <p className="font-black text-green-700 text-sm">{COMPANY}</p>
            </div>
            <p className="text-xs text-gray-400">This document is prepared for all workers of {COMPANY}.</p>
            <p className="text-xs text-gray-400">Printed / Generated: {DATE_PRINTED}</p>
            <p className="text-xs text-gray-500 font-semibold mt-2">
              By working at {COMPANY}, you agree to follow all the rules in this document.
            </p>
          </div>

        </div>{/* end .hb-doc */}

        {/* Bottom toolbar — screen only */}
        <div className="no-print max-w-3xl mx-auto mt-4 flex flex-wrap gap-2 justify-center">
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-colors">
            {copied ? <><CheckCircle size={14} className="text-green-600" /> Text Copied!</> : <><Copy size={14} /> Copy Full Text</>}
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow transition-colors">
            <Printer size={14} /> Download Worker Handbook (PDF)
          </button>
        </div>

      </div>{/* end .hb-page */}
    </>
  );
}
