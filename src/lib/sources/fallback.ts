import type { Work } from "../types";

/**
 * The sealed offline sample.
 *
 * If both museums are unreachable the product still has to render, so a small
 * set of real records is committed to the repository. Every field here was
 * copied from an actual API response, and the whole sample carries one
 * `SEALED_AT` timestamp rather than pretending to be current.
 *
 * The rule that keeps this honest: a fallback work always has
 * `provenance.status === "fallback"`, and the interface says so in words, with the
 * date the sample was taken. Nothing in the product may present these as today's
 * answer, and no user-created record is ever drawn from this file.
 */

export const SEALED_AT = "2026-10-04T00:00:00.000Z";

const MET_FALLBACK: Work[] = [
  {
    id: "met:11298",
    institution: "met",
    upstreamId: "11298",
    title: "A Jaguar",
    culture: "American",
    period: null,
    creator: { name: "Edward Kemeys", birthYear: 1843, deathYear: 1907, wikidataId: "Q5343908", anonymous: false },
    madeYear: 1885,
    madeLabel: "1885",
    medium: "Bronze",
    classification: null,
    rightsStatement: null,
    institutionCleared: true,
    licenseLabel: "Public Domain",
    institutionCreditLine: "Gift of Mrs. James P. Paulding, 1918",
    accessionNumber: "18.80",
    department: "The American Wing",
    image: {
      url: "https://images.metmuseum.org/CRDImages/ad/web-large/DP271632.jpg",
      width: null,
      height: null,
      alt: "A Jaguar by Edward Kemeys, The Metropolitan Museum of Art",
    },
    pageUrl: "https://www.metmuseum.org/art/collection/search/11298",
    metadataUpdatedAt: "2026-03-31T09:41:00.230Z",
    provenance: {
      provider: "met",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "met:11298",
      attribution: "The Metropolitan Museum of Art, Collection API (Open Access)",
      termsUrl: "https://www.metmuseum.org/information/terms-and-conditions",
    },
  },
  {
    id: "met:316666",
    institution: "met",
    upstreamId: "316666",
    title: "Jaguar Pendant",
    culture: "Chiriquí",
    period: null,
    creator: { name: "Unrecorded maker", birthYear: null, deathYear: null, wikidataId: null, anonymous: true },
    madeYear: 1600,
    madeLabel: "11th–16th century",
    medium: "Gold",
    classification: "Metal-Ornaments",
    rightsStatement: null,
    institutionCleared: true,
    licenseLabel: "Public Domain",
    institutionCreditLine: "Jan Mitchell and Sons Collection, Gift of Jan Mitchell, 1991",
    accessionNumber: "1991.419.6",
    department: "The Michael C. Rockefeller Wing",
    image: {
      url: "https://images.metmuseum.org/CRDImages/ao/web-large/DP-26298-002.jpg",
      width: null,
      height: null,
      alt: "Jaguar Pendant, an unrecorded Chiriquí maker, The Metropolitan Museum of Art",
    },
    pageUrl: "https://www.metmuseum.org/art/collection/search/316666",
    metadataUpdatedAt: "2025-12-20T04:50:39.430Z",
    provenance: {
      provider: "met",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "met:316666",
      attribution: "The Metropolitan Museum of Art, Collection API (Open Access)",
      termsUrl: "https://www.metmuseum.org/information/terms-and-conditions",
    },
  },
  {
    id: "met:19275",
    institution: "met",
    upstreamId: "19275",
    title: "Jaguar",
    culture: "American",
    period: null,
    creator: {
      name: "Anna Hyatt Huntington",
      birthYear: 1876,
      deathYear: 1973,
      wikidataId: "Q445026",
      anonymous: false,
    },
    madeYear: 1926,
    madeLabel: "1906–7; cast 1926",
    medium: "Bronze",
    classification: null,
    rightsStatement: null,
    institutionCleared: false,
    licenseLabel: null,
    institutionCreditLine: "Gift of Archer M. Huntington, 1926",
    accessionNumber: "26.85.2",
    department: "The American Wing",
    // Deliberately null: the institution withholds an image for a record it
    // marks in copyright, and the product shows that honestly.
    image: null,
    pageUrl: "https://www.metmuseum.org/art/collection/search/19275",
    metadataUpdatedAt: "2025-01-30T04:54:21.210Z",
    provenance: {
      provider: "met",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "met:19275",
      attribution: "The Metropolitan Museum of Art, Collection API (Open Access)",
      termsUrl: "https://www.metmuseum.org/information/terms-and-conditions",
    },
  },
];

const CLE_FALLBACK: Work[] = [
  {
    id: "cle:135382",
    institution: "cle",
    upstreamId: "135382",
    title: "The Red Kerchief",
    culture: "France, 19th century",
    period: "oil",
    creator: { name: "Claude Monet", birthYear: 1840, deathYear: 1926, wikidataId: null, anonymous: false },
    madeYear: 1873,
    madeLabel: "c. 1868-73",
    medium: "Painting, oil",
    classification: "Painting",
    rightsStatement: null,
    institutionCleared: true,
    licenseLabel: "CC0",
    institutionCreditLine: "Bequest of Leonard C. Hanna Jr.",
    accessionNumber: "1958.39",
    department: "Modern European Painting and Sculpture",
    image: {
      url: "https://openaccess-cdn.clevelandart.org/1958.39/1958.39_web.jpg",
      width: 723,
      height: 900,
      alt: "The Red Kerchief by Claude Monet, The Cleveland Museum of Art",
    },
    pageUrl: "https://clevelandart.org/art/1958.39",
    metadataUpdatedAt: "2026-10-03T11:03:56.635Z",
    provenance: {
      provider: "cle",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "cle:135382",
      attribution: "The Cleveland Museum of Art, Open Access API",
      termsUrl: "https://www.clevelandart.org/open-access",
    },
  },
  {
    id: "cle:136510",
    institution: "cle",
    upstreamId: "136510",
    title: "Water Lilies (Agapanthus)",
    culture: "France, late 19th century-early 20th century",
    period: "oil",
    creator: { name: "Claude Monet", birthYear: 1840, deathYear: 1926, wikidataId: null, anonymous: false },
    madeYear: 1926,
    madeLabel: "c. 1915-26",
    medium: "Painting, oil",
    classification: "Painting",
    rightsStatement: null,
    institutionCleared: true,
    licenseLabel: "CC0",
    institutionCreditLine: "John L. Severance Fund and an anonymous gift",
    accessionNumber: "1960.81",
    department: "Modern European Painting and Sculpture",
    image: {
      url: "https://openaccess-cdn.clevelandart.org/1960.81/1960.81_web.jpg",
      width: 900,
      height: 419,
      alt: "Water Lilies (Agapanthus) by Claude Monet, The Cleveland Museum of Art",
    },
    pageUrl: "https://clevelandart.org/art/1960.81",
    metadataUpdatedAt: "2026-10-03T11:03:56.656Z",
    provenance: {
      provider: "cle",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "cle:136510",
      attribution: "The Cleveland Museum of Art, Open Access API",
      termsUrl: "https://www.clevelandart.org/open-access",
    },
  },
  {
    id: "cle:127147",
    institution: "cle",
    upstreamId: "127147",
    title: "Ceremonial Mace (Club) Head: Feline (Jaguar?)",
    culture: "Costa Rica, Southern Nicoya region",
    period: "stone",
    creator: { name: "Unrecorded maker", birthYear: null, deathYear: null, wikidataId: null, anonymous: true },
    madeYear: 600,
    madeLabel: "c. 300 BCE-600 CE",
    medium: "Stone",
    classification: "Stone",
    rightsStatement: null,
    institutionCleared: true,
    licenseLabel: "CC0",
    institutionCreditLine: "In memory of Mr. and Mrs. Henry Humphreys, gift of their daughter Helen",
    accessionNumber: "1949.469",
    department: "Art of the Americas",
    image: {
      url: "https://openaccess-cdn.clevelandart.org/1949.469/1949.469_web.jpg",
      width: 1061,
      height: 893,
      alt: "Ceremonial Mace (Club) Head: Feline (Jaguar?), an unrecorded Costa Rican maker, The Cleveland Museum of Art",
    },
    pageUrl: "https://clevelandart.org/art/1949.469",
    metadataUpdatedAt: "2026-05-29T06:33:22.009Z",
    provenance: {
      provider: "cle",
      status: "fallback",
      fetchedAt: SEALED_AT,
      upstreamId: "cle:127147",
      attribution: "The Cleveland Museum of Art, Open Access API",
      termsUrl: "https://www.clevelandart.org/open-access",
    },
  },
];

/** Everything in the sealed sample, ordered institution then accession. */
export const FALLBACK_WORKS: Work[] = [...MET_FALLBACK, ...CLE_FALLBACK];

export function fallbackWorks(): Work[] {
  return FALLBACK_WORKS.map((work) => ({
    ...work,
    creator: { ...work.creator },
    image: work.image ? { ...work.image } : null,
    provenance: { ...work.provenance },
  }));
}