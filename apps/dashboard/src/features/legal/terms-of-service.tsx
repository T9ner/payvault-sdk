import { LegalLayout } from './legal-layout'

export function TermsOfService() {
  return (
    <LegalLayout title='Terms of Service' lastUpdated='April 9, 2026'>
      <div className='space-y-8'>
        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>1. Agreement to Terms</h2>
          <p>
            By accessing or using PayVault, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service. PayVault provides payment processing solutions, dashboard analytics, and fraud protection services for merchants.
          </p>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>2. Account Security</h2>
          <p>
            Currently, PayVault uses GitHub OAuth for authentication. You are responsible for maintaining the security of your GitHub account. PayVault is not liable for any loss or damage arising from your failure to comply with this security obligation. Any activity occurring under your account is your responsibility.
          </p>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>3. Payment Processing Services</h2>
          <p>
            PayVault facilitates transactions between merchants and their customers. By using our services, you authorize PayVault to hold, receive, and disburse funds on your behalf. You agree to comply with all rules and regulations of the payment networks (e.g., Visa, Mastercard) and applicable laws.
          </p>
          <ul className='list-disc pl-6 space-y-2'>
            <li>Merchants must provide accurate business information.</li>
            <li>Chargebacks and disputes are the responsibility of the merchant.</li>
            <li>PayVault reserves the right to hold funds in case of suspicious activity.</li>
          </ul>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>4. Prohibited Activities</h2>
          <p>
            You may not use PayVault for any illegal activities, including but not limited to money laundering, financing terrorism, or processing transactions for prohibited goods and services as defined by our partner banks and local regulations.
          </p>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>5. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, PayVault and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly.
          </p>
        </section>

        <section className='space-y-4'>
          <h2 className='text-2xl font-bold'>6. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>
        </section>

        <section className='space-y-4 border-t pt-8'>
          <p className='text-muted-foreground italic text-sm'>
            If you have any questions about these Terms, please contact support@payvault.com.
          </p>
        </section>
      </div>
    </LegalLayout>
  )
}
