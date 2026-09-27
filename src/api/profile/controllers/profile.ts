/**
 * profile controller
 */

import { factories } from '@strapi/strapi';
import { profilePopulate } from '../../../utils/consumer-populate';

export default factories.createCoreController('api::profile.profile', () => ({
  async find(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: profilePopulate,
    };

    return super.find(ctx);
  },
}));
