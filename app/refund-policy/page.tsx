import Link from "next/link";

export const metadata = {
  title: "Refund Policy — Metalyzi",
};

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Refund Policy</h1>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Last updated: 4 April 2026
      </p>

      {/* 1. Overview */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        1. Overview
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Metusa Property Ltd, trading as Metalyzi (company number 15651934,
        registered in England and Wales), is committed to fair and transparent
        refund practices. This policy explains when and how you can request a
        refund for purchases made through our platform at{" "}
        <a
          href="https://www.metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          www.metalyzi.co.uk
        </a>
        .
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Our registered address is 9D Worrall Street, Salford, Manchester, M5
        4TZ. If you have any questions about this policy, please contact us at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>
        .
      </p>

      {/* 2. 14-Day Cooling-Off Period */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        2. 14-Day Cooling-Off Period
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Under the Consumer Contracts (Information, Cancellation and Additional
        Charges) Regulations 2013, you have the right to cancel your purchase
        within 14 days of the date of purchase without giving any reason.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        However, please note that if you request that services begin within the
        cooling-off period (for example, by generating a property deal report),
        you acknowledge that you may lose the right to cancel once the digital
        service has been fully performed. By generating a report, you expressly
        consent to the immediate performance of the service and acknowledge that
        your right of cancellation will be lost once the report has been
        delivered.
      </p>

      {/* 3. Subscription Refunds */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        3. Subscription Refunds
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We offer the following subscription plans:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Free:</strong> £0/month — 1 report per month
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Starter:</strong> £29/month — 5 reports per month
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Pro:</strong> £79/month — 20 reports per month
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Unlimited:</strong> £199/month — unlimited reports per month
        </li>
      </ul>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        The following refund rules apply to subscription plans:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          You may cancel your subscription at any time. Cancellation takes effect
          at the end of your current billing period, and you will retain access
          to the service until that date.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          No partial refunds are provided for unused time remaining in your
          current billing period.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          If you cancel your subscription within 14 days of purchase and have not
          generated any reports during that billing period, you are entitled to a
          full refund in accordance with your cooling-off rights.
        </li>
      </ul>

      {/* 4. Pay-Per-Deal Refunds */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        4. Pay-Per-Deal Refunds
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Our Pay-Per-Deal option is priced at £15 per report. The following
        refund rules apply:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Once a report has been generated and delivered to you, no refund is
          available. This is because the digital content has been fully performed
          with your prior consent.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          If a report fails to generate due to a technical error on our side, you
          are entitled to a full refund or an account credit at your choice. We
          will investigate all such claims and aim to resolve them promptly.
        </li>
      </ul>

      {/* 5. How to Request a Refund */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        5. How to Request a Refund
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        To request a refund, please email us at{" "}
        <a
          href="mailto:contact@metalyzi.co.uk"
          className="text-primary underline hover:text-primary/80"
        >
          contact@metalyzi.co.uk
        </a>{" "}
        with the following information:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Your full name and the email address associated with your account
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          The date of purchase
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Your order or transaction reference number
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          The reason for your refund request
        </li>
      </ul>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We will acknowledge your request within 2 business days and aim to
        resolve all refund requests as quickly as possible.
      </p>

      {/* 6. Refund Processing */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        6. Refund Processing
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Approved refunds will be processed within 14 days of approval. Refunds
        are issued to your original payment method via Stripe, our payment
        processor. Depending on your bank or card issuer, it may take an
        additional 5-10 business days for the refund to appear on your
        statement.
      </p>

      {/* 7. Exceptions */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        7. Exceptions
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Refunds will not be granted in the following circumstances:
      </p>
      <ul className="mb-4 list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Reports that have already been generated and delivered to you, as the
          digital content has been fully performed.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Accounts that have been terminated due to violations of our{" "}
          <Link
            href="/terms-of-service"
            className="text-primary underline hover:text-primary/80"
          >
            Terms of Service
          </Link>{" "}
          or{" "}
          <Link
            href="/acceptable-use"
            className="text-primary underline hover:text-primary/80"
          >
            Acceptable Use Policy
          </Link>
          .
        </li>
      </ul>

      {/* 8. Your Statutory Rights */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        8. Your Statutory Rights
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Nothing in this refund policy is intended to affect or limit your
        statutory rights under UK consumer law, including the Consumer Rights Act
        2015 and the Consumer Contracts (Information, Cancellation and Additional
        Charges) Regulations 2013. If any provision of this policy conflicts with
        your statutory rights, your statutory rights will prevail.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        For further information about your statutory rights, you may contact
        Citizens Advice at{" "}
        <a
          href="https://www.citizensadvice.org.uk"
          className="text-primary underline hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
        >
          www.citizensadvice.org.uk
        </a>{" "}
        or call the Citizens Advice consumer helpline.
      </p>

      {/* 9. Contact Us */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        9. Contact Us
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you have any questions about this refund policy or wish to discuss a
        refund request, please contact us:
      </p>
      <ul className="mb-4 list-none pl-0">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Company:</strong> Metusa Property Ltd, trading as Metalyzi
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong>Company Number:</strong> 15651934 (registered in England and
          Wales)
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
            className="text-primary underline hover:text-primary/80"
          >
            www.metalyzi.co.uk
          </a>
        </li>
      </ul>
    </div>
  );
}
