import { LegalLayout } from './legal-layout'

export function PrivacyPolicy() {
  return (
    <LegalLayout title='Privacy Policy' lastUpdated='April 9, 2026'>
      <div className='space-y-8'>
        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>1. Information We Collect</h2>
          <p>
            At PayVault, we collect information to provide better services to all our merchants. We collect data in the following ways:
          </p>
          <ul className='list-disc pl-6 space-y-2'>
            <li><strong>Information you give us:</strong> Since we use GitHub OAuth, we receive your GitHub profile information (such as username, name, and email) to create and identify your merchant account.</li>
            <li><strong>Financial Information:</strong> We collect business details, transaction history, and payout information necessary to process payments.</li>
            <li><strong>Log Information:</strong> When you use our service, we automatically collect and store certain information in server logs, such as IP addresses and browser type.</li>
          </ul>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>2. How We Use Information</h2>
          <p>
            We use the information we collect to provide, maintain, protect and improve our services, to develop new ones, and to protect PayVault and our users. This includes:
          </p>
          <ul className='list-disc pl-6 space-y-2'>
            <li>Processing your transactions and managing your merchant dashboard.</li>
            <li>Protecting your account from fraud and unauthorized access.</li>
            <li>Sending you technical notices, updates, and security alerts.</li>
          </ul>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>3. Information We Share</h2>
          <p>
            We do not share personal information with companies, organizations, or individuals outside of PayVault unless one of the following circumstances applies:
          </p>
          <ul className='list-disc pl-6 space-y-2'>
            <li><strong>With your consent:</strong> We will share information with third parties when we have your explicit permission.</li>
            <li><strong>For external processing:</strong> We provide information to our trusted partners (such as bank processors and fraud detection services) to process it for us, based on our instructions.</li>
            <li><strong>For legal reasons:</strong> We will share information if we have a good-faith belief that access, use, preservation or disclosure is reasonably necessary to meet any applicable law, regulation, legal process or enforceable governmental request.</li>
          </ul>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>4. Data Security</h2>
          <p>
            We work hard to protect PayVault and our users from unauthorized access to or unauthorized alteration, disclosure or destruction of information we hold. In particular:
          </p>
          <ul className='list-disc pl-6 space-y-2'>
            <li>We encrypt many of our services using SSL/TLS.</li>
            <li>We review our information collection, storage and processing practices, including physical security measures.</li>
            <li>We restrict access to personal information to PayVault employees and contractors who need that information in order to process it for us.</li>
          </ul>
        </section>

        <section className='space-y-4 border-t pt-8'>
          <p className='text-muted-foreground italic text-sm'>
            If you have any questions about this Privacy Policy, please contact privacy@payvault.com.
          </p>
        </section>
      </div>
    </LegalLayout>
  )
}
