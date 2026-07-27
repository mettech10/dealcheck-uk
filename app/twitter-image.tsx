/**
 * X (Twitter) preview card — same 1200×630 artwork as the Open Graph image.
 * Declared separately so Next emits an explicit `twitter:image` alongside
 * `og:image`; X prefers the former and some clients only read that one.
 */
export { default, alt, size, contentType } from './opengraph-image'
