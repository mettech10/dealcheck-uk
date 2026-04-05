import Link from "next/link";

export const metadata = {
  title: "Legal — Metalyzi",
};

const legalDocuments = [
  {
    title: "Privacy Policy",
    href: "/privacy-policy",
    description: "How we collect, use, and protect your personal data",
  },
  {
    title: "Cookie Policy",
    href: "/cookie-policy",
    description: "Information about the cookies we use",
  },
  {
    title: "Terms of Service",
    href: "/terms-of-service",
    description: "The rules governing your use of Metalyzi",
  },
  {
    title: "Disclaimer",
    href: "/disclaimer",
    description: "Important information about the nature of our service",
  },
  {
    title: "Refund Policy",
    href: "/refund-policy",
    description: "Our refund and cancellation terms",
  },
];

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold text-foreground">
        Legal Overview
      </h1>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Last updated: 4 April 2026
      </p>

      {/* Introduction */}
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        This page provides an overview of the legal documents governing your use
        of Metalyzi, a property deal analysis platform operated by Metusa
        Property Ltd. We are committed to transparency and compliance with all
        applicable UK laws and regulations. Please review each document carefully
        to understand your rights and obligations when using our services.
      </p>

      {/* Company Information */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        Company Information
      </h2>

      <ul className="list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Full company name:</strong> Metusa
          Property Ltd
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Trading as:</strong> Metalyzi
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Company number:</strong> 15651934,
          registered in England and Wales
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Registered address:</strong> 9D
          Worrall Street, Salford, Manchester, M5 4TZ
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Email:</strong>{" "}
          <a
            href="mailto:contact@metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            contact@metalyzi.co.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Phone:</strong>{" "}
          <a
            href="tel:+447949588127"
            className="text-primary underline hover:text-primary/80"
          >
            +44 7949 588127
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Website:</strong>{" "}
          <a
            href="https://www.metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.metalyzi.co.uk
          </a>
        </li>
      </ul>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Metusa Property Ltd is not authorised or regulated by the Financial
        Conduct Authority (FCA). Metalyzi does not provide financial advice,
        investment recommendations, or any form of regulated financial service.
        Our platform offers analytical tools designed to assist users in
        evaluating property deals using publicly available data.
      </p>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        As a company that processes personal data, Metusa Property Ltd is aware
        of its obligations under the UK GDPR and the Data Protection Act 2018.
        If you process personal data, registration with the Information
        Commissioner&apos;s Office (ICO) may be required. For details on our
        data processing practices, please refer to our{" "}
        <Link
          href="/privacy-policy"
          className="text-primary underline hover:text-primary/80"
        >
          Privacy Policy
        </Link>
        .
      </p>

      {/* Legal Documents */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        Legal Documents
      </h2>

      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        The following documents outline the terms, policies, and disclaimers
        that apply to your use of Metalyzi. We encourage you to read each
        document in full.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {legalDocuments.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="rounded-lg border border-border/50 p-6 transition-colors hover:border-primary/30"
          >
            <h3 className="mb-2 text-base font-semibold text-foreground">
              {doc.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {doc.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Regulatory Information */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        Regulatory Information
      </h2>

      <ul className="list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Metusa Property Ltd is registered with Companies House under company
          number 15651934.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Metalyzi is <strong className="text-foreground">not</strong>{" "}
          authorised or regulated by the Financial Conduct Authority (FCA). We
          do not hold any FCA permissions and are not listed on the FCA Register.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Our services consist of analytical tools for property deal evaluation.
          These are not regulated financial products, and no information provided
          through Metalyzi should be construed as financial, investment, tax, or
          legal advice.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Metusa Property Ltd is committed to compliance with the UK General
          Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.
          We implement appropriate technical and organisational measures to
          protect your personal data.
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Users are responsible for conducting their own due diligence and
          seeking independent professional advice before making any property
          investment decisions.
        </li>
      </ul>

      {/* Contact for Legal Inquiries */}
      <h2 className="mb-4 mt-10 text-xl font-semibold text-foreground">
        Contact for Legal Inquiries
      </h2>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        If you have any questions about the legal documents on this page, your
        rights, or how we handle your data, please contact us:
      </p>

      <ul className="list-disc pl-6">
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Email:</strong>{" "}
          <a
            href="mailto:contact@metalyzi.co.uk"
            className="text-primary underline hover:text-primary/80"
          >
            contact@metalyzi.co.uk
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Phone:</strong>{" "}
          <a
            href="tel:+447949588127"
            className="text-primary underline hover:text-primary/80"
          >
            +44 7949 588127
          </a>
        </li>
        <li className="mb-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Post:</strong> Metusa Property
          Ltd, 9D Worrall Street, Salford, Manchester, M5 4TZ
        </li>
      </ul>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        We aim to respond to all legal inquiries within 14 business days.
      </p>
    </div>
  );
}
