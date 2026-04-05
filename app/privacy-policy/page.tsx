import Link from "next/link";

export const metadata = { title: "Privacy Policy — Metalyzi" };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold text-foreground">
        Privacy Policy
      </h1>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Last updated: 4 April 2026
      </p>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        This privacy policy explains how Metusa Property Ltd, trading as
        Metalyzi, collects, uses, stores, and shares your personal data when you
        use our website and services. We are committed to protecting your privacy
        and handling your data in accordance with the UK General Data Protection
        Regulation (UK GDPR) and the Data Protection Act 2018.
      </p>

      {/* 1. Who We Are */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        1. Who We Are
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Metalyzi is a trading name of Metusa Property Ltd, a company registered
        in England and Wales under company number 15651934. Our registered
        address is 9D Worrall Street, Salford, Manchester, M5 4TZ.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        For the purposes of the UK GDPR, Metusa Property Ltd is the data
        controller responsible for your personal data. If you have any questions
        about how we process your data, you can contact our Data Protection
        Officer at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>
        .
      </p>

      {/* 2. What Data We Collect */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        2. What Data We Collect
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We may collect and process the following categories of personal data:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Account data:</strong> Your name, email address, and password
          when you create an account with us.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Property analysis data:</strong> Property details, addresses,
          financial figures, and other information you input when using our
          property analysis tools.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Payment data:</strong> When you subscribe to a paid plan,
          payment processing is handled by Stripe. We do not store your full
          credit or debit card details on our servers. Stripe may collect your
          card number, expiry date, CVC, and billing address directly. Please
          refer to{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            Stripe&apos;s Privacy Policy
          </a>{" "}
          for further information.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Usage and analytics data:</strong> Information about how you
          interact with our platform, including pages visited, features used,
          time spent on pages, browser type, device information, IP address, and
          referring URLs.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Cookies and similar technologies:</strong> We use cookies and
          similar tracking technologies to enhance your experience, remember your
          preferences, and analyse site traffic. You can manage your cookie
          preferences through your browser settings. For more information, please
          see our{" "}
          <Link
            href="/cookie-policy"
            className="text-primary underline hover:text-primary/80"
          >
            Cookie Policy
          </Link>
          .
        </li>
      </ul>

      {/* 3. Legal Basis for Processing */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        3. Legal Basis for Processing
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We process your personal data on the following legal bases under the UK
        GDPR:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Performance of a contract (Article 6(1)(b)):</strong> We
          process your account data, property analysis data, and payment data as
          necessary to provide you with our services and fulfil the terms of your
          subscription.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Legitimate interests (Article 6(1)(f)):</strong> We process
          usage and analytics data to improve our platform, ensure security,
          detect fraud, and understand how users interact with our services. We
          have carried out a legitimate interests assessment and concluded that
          these interests do not override your rights and freedoms.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Consent (Article 6(1)(a)):</strong> Where we send you
          marketing communications or use non-essential cookies, we do so based
          on your consent. You can withdraw your consent at any time by
          contacting us or using the unsubscribe link in our emails.
        </li>
      </ul>

      {/* 4. How We Use Your Data */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        4. How We Use Your Data
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We use the personal data we collect for the following purposes:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To provide and maintain our services:</strong> Including
          creating and managing your account, processing your property analyses,
          and delivering the results to you.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To improve our platform:</strong> Analysing usage patterns and
          feedback to enhance features, fix issues, and develop new
          functionality.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To communicate with you:</strong> Sending service-related
          notifications, responding to your enquiries, and, where you have
          consented, sending marketing communications about new features or
          updates.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To process payments:</strong> Facilitating subscription
          payments through Stripe and managing your billing information.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To ensure security and prevent fraud:</strong> Monitoring for
          suspicious activity and protecting the integrity of our platform.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>To comply with legal obligations:</strong> Where required by
          law, regulation, or legal process.
        </li>
      </ul>

      {/* 5. Data Sharing */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        5. Who We Share Your Data With
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We do not sell your personal data to any third party. We may share your
        data with the following trusted service providers who assist us in
        operating our platform:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Stripe:</strong> Processes payments on our behalf. Stripe
          receives your payment card details and billing information to complete
          transactions securely.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Supabase:</strong> Provides database hosting and
          authentication services. Your account data and property analysis data
          are stored on Supabase infrastructure.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Anthropic:</strong> Provides AI-powered analysis
          capabilities. Property data you submit may be sent to Anthropic&apos;s
          API for processing and analysis. Anthropic processes this data in
          accordance with their data processing terms.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Vercel:</strong> Hosts our web application. Vercel may process
          technical data such as IP addresses and request logs as part of
          delivering the service.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Brevo (formerly Sendinblue):</strong> Handles transactional
          and marketing email delivery. Your email address and name may be shared
          with Brevo to send you service notifications and, where you have
          consented, marketing communications.
        </li>
      </ul>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We may also disclose your data if required to do so by law or in
        response to valid requests by public authorities, such as a court order
        or government agency.
      </p>

      {/* 6. Data Retention */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        6. Data Retention
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We retain your personal data only for as long as is necessary to fulfil
        the purposes for which it was collected:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Account data:</strong> Retained for as long as your account is
          active. If you delete your account, we will erase your personal data
          within 30 days, unless we are required to retain it for legal or
          regulatory reasons.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Property analysis data:</strong> Retained for as long as your
          account is active and deleted upon account closure, unless you request
          earlier deletion.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Payment data:</strong> Transaction records are retained for up
          to 7 years to comply with tax and accounting obligations. Stripe
          retains payment card details in accordance with their own retention
          policies.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Usage and analytics data:</strong> Retained in an anonymised
          or aggregated form for up to 24 months for analytical purposes.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Marketing consent records:</strong> Retained for as long as
          necessary to demonstrate compliance with consent requirements.
        </li>
      </ul>

      {/* 7. Your Rights Under UK GDPR */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        7. Your Rights Under UK GDPR
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Under the UK GDPR, you have the following rights in relation to your
        personal data:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right of access:</strong> You have the right to request a copy
          of the personal data we hold about you.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to rectification:</strong> You have the right to request
          that we correct any inaccurate or incomplete personal data.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to erasure:</strong> You have the right to request that
          we delete your personal data, subject to certain legal exceptions.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to restrict processing:</strong> You have the right to
          request that we limit how we use your personal data in certain
          circumstances.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to data portability:</strong> You have the right to
          receive your personal data in a structured, commonly used, and
          machine-readable format, and to transmit it to another controller.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to object:</strong> You have the right to object to
          processing based on legitimate interests or for direct marketing
          purposes.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Right to withdraw consent:</strong> Where processing is based
          on your consent, you have the right to withdraw that consent at any
          time. Withdrawal of consent does not affect the lawfulness of
          processing carried out before the withdrawal.
        </li>
      </ul>

      {/* 8. How to Exercise Your Rights */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        8. How to Exercise Your Rights
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        To exercise any of your rights, please contact our Data Protection
        Officer by email at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>
        . We will respond to your request within one month of receipt. In some
        cases, we may need to verify your identity before processing your
        request. If your request is complex or we receive a large number of
        requests, we may extend the response period by a further two months, in
        which case we will inform you of the extension and the reasons for it.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        There is no fee for exercising your rights, unless your request is
        manifestly unfounded or excessive, in which case we may charge a
        reasonable fee or refuse to act on the request.
      </p>

      {/* 9. International Transfers */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        9. International Data Transfers
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Some of the third-party service providers we use (including Stripe,
        Supabase, Anthropic, Vercel, and Brevo) may process your data outside
        the United Kingdom. Where personal data is transferred to a country that
        has not been deemed to provide an adequate level of data protection by
        the UK Secretary of State, we ensure that appropriate safeguards are in
        place to protect your data. These safeguards include the use of Standard
        Contractual Clauses (SCCs) approved by the UK Information Commissioner,
        or the International Data Transfer Agreement (IDTA) where applicable.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        You may request a copy of the relevant safeguards by contacting our Data
        Protection Officer at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>
        .
      </p>

      {/* 10. Children's Privacy */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        10. Children&apos;s Privacy
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Our services are not intended for individuals under the age of 18. We do
        not knowingly collect personal data from children under 18. If we become
        aware that we have collected personal data from a child under 18 without
        appropriate parental consent, we will take steps to delete that
        information as soon as possible. If you believe that we may have
        collected data from a child under 18, please contact us immediately at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>
        .
      </p>

      {/* 11. Changes to This Policy */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        11. Changes to This Privacy Policy
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We may update this privacy policy from time to time to reflect changes
        in our practices, technology, legal requirements, or other factors. When
        we make material changes, we will notify you by updating the date at the
        top of this policy and, where appropriate, by sending you an email
        notification or displaying a prominent notice on our website. We
        encourage you to review this policy periodically to stay informed about
        how we are protecting your data.
      </p>

      {/* 12. How to Complain */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        12. How to Make a Complaint
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you are unhappy with how we have handled your personal data, we
        encourage you to contact our Data Protection Officer first at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>{" "}
        so that we can try to resolve the issue.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        You also have the right to lodge a complaint with the Information
        Commissioner&apos;s Office (ICO), the UK&apos;s supervisory authority
        for data protection. You can contact the ICO using the following
        details:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Website:{" "}
          <a
            href="https://ico.org.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            ico.org.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Telephone: 0303 123 1113
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Address: Information Commissioner&apos;s Office, Wycliffe House, Water
          Lane, Wilmslow, Cheshire, SK9 5AF
        </li>
      </ul>

      {/* 13. Contact Details */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        13. Contact Us
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you have any questions about this privacy policy or our data
        practices, please contact us:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Company:</strong> Metusa Property Ltd, trading as Metalyzi
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Address:</strong> 9D Worrall Street, Salford, Manchester, M5
          4TZ
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Email:</strong>{" "}
          <a
            href="mailto:contact@metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            contact@metalyzi.co.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Phone:</strong>{" "}
          <a
            href="tel:+447949588127"
            className="text-primary underline hover:text-primary/80"
          >
            +44 7949 588127
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Website:</strong>{" "}
          <a
            href="https://www.metalyzi.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            www.metalyzi.co.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Data Protection Officer:</strong>{" "}
          <a
            href="mailto:contact@metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            contact@metalyzi.co.uk
          </a>
        </li>
      </ul>
    </div>
  );
}
