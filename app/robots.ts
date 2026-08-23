import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/explore',
          '/free-tools',
          '/login',
          '/privacy',
          '/terms',
          '/contact',
          '/api/explore/',
          '/llms.txt',
          '/.well-known/',
        ],
        disallow: ['/admin', '/stats', '/import', '/onboarding', '/apply-profile', '/api/coverletter', '/api/ats-', '/api/extension/', '/api/dream-companies', '/api/debug-'],
      },
    ],
    sitemap: 'https://hyred.in/sitemap.xml',
  };
}
