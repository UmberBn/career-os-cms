import type { Schema, Struct } from '@strapi/strapi';

export interface ProfileLanguage extends Struct.ComponentSchema {
  collectionName: 'components_profile_languages';
  info: {
    displayName: 'Language';
    icon: 'globe';
  };
  attributes: {
    language: Schema.Attribute.String & Schema.Attribute.Required;
    level: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedAchievement extends Struct.ComponentSchema {
  collectionName: 'components_shared_achievements';
  info: {
    displayName: 'Achievement';
    icon: 'trophy';
  };
  attributes: {
    description: Schema.Attribute.Blocks;
    impact: Schema.Attribute.String;
    metrics: Schema.Attribute.String;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_links';
  info: {
    displayName: 'Link';
    icon: 'link';
  };
  attributes: {
    label: Schema.Attribute.String;
    url: Schema.Attribute.String;
  };
}

export interface SharedNarrative extends Struct.ComponentSchema {
  collectionName: 'components_shared_narratives';
  info: {
    displayName: 'Narrative';
    icon: 'book';
  };
  attributes: {
    context: Schema.Attribute.Blocks;
    problem: Schema.Attribute.Blocks;
    result: Schema.Attribute.Blocks;
    solution: Schema.Attribute.Blocks;
  };
}

export interface SharedReferenceContact extends Struct.ComponentSchema {
  collectionName: 'components_shared_reference_contacts';
  info: {
    displayName: 'ReferenceContact';
    icon: 'user';
  };
  attributes: {
    email: Schema.Attribute.Email;
    linkedin: Schema.Attribute.String;
    name: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    role: Schema.Attribute.String;
  };
}

export interface SharedTechnology extends Struct.ComponentSchema {
  collectionName: 'components_shared_technologies';
  info: {
    displayName: 'Technology';
    icon: 'cog';
  };
  attributes: {
    category: Schema.Attribute.String;
    name: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'profile.language': ProfileLanguage;
      'shared.achievement': SharedAchievement;
      'shared.link': SharedLink;
      'shared.narrative': SharedNarrative;
      'shared.reference-contact': SharedReferenceContact;
      'shared.technology': SharedTechnology;
    }
  }
}
