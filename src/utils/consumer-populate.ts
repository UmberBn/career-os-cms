/**
 * Fixed populate trees for external API consumers (Custom GPT).
 * Controllers replace any client-provided populate with these values
 * so relations and components are returned without leaking referenceContacts.
 */

export const companyFields = ['name', 'website', 'industry', 'description'] as const;

export const experienceListFields = [
  'title',
  'type',
  'startDate',
  'endDate',
] as const;

export const profilePopulate = {
  languages: true,
} as const;

export const companyPopulate = {
  experiences: {
    fields: [...experienceListFields],
  },
} as const;

export const experiencePopulate = {
  company: {
    fields: [...companyFields],
  },
  projects: {
    populate: {
      narrative: true,
      technologies: true,
      achievements: true,
      links: true,
    },
  },
} as const;

export const projectPopulate = {
  narrative: true,
  technologies: true,
  achievements: true,
  links: true,
  experience: {
    populate: {
      company: {
        fields: [...companyFields],
      },
    },
  },
} as const;
