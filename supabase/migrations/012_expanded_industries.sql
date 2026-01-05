-- ============================================
-- Expanded Industries for AI Voice Agents
-- Migration: 012_expanded_industries.sql
-- ============================================
-- VoiceFleet serves any business that handles phone calls
-- This migration adds industries beyond food service

-- ============================================
-- HEALTHCARE & MEDICAL
-- ============================================

-- Tier 1: High call volume healthcare
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'medical-clinics', 'Medical Clinics', 1, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'dental-practices', 'Dental Practices', 1, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'gp-surgeries', 'GP Surgeries', 1, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'pharmacies', 'Pharmacies', 1, '{"type": "healthcare", "use_case": "prescription-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Specialist healthcare
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'veterinary-clinics', 'Veterinary Clinics', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'physiotherapy', 'Physiotherapy Clinics', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'chiropractors', 'Chiropractors', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'opticians', 'Opticians', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'mental-health', 'Mental Health Services', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'dermatology', 'Dermatology Clinics', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'orthodontists', 'Orthodontists', 2, '{"type": "healthcare", "use_case": "appointment-scheduling"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche healthcare
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'podiatrists', 'Podiatrists', 3, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'audiologists', 'Audiologists', 3, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'speech-therapy', 'Speech Therapy', 3, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'acupuncture', 'Acupuncture Clinics', 3, '{"type": "healthcare", "use_case": "appointment-scheduling"}'),
  ('industry', 'cosmetic-clinics', 'Cosmetic Clinics', 3, '{"type": "healthcare", "use_case": "consultation-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- PROFESSIONAL SERVICES
-- ============================================

-- Tier 1: High demand professional services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'law-firms', 'Law Firms', 1, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'accountants', 'Accountants', 1, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'insurance-agencies', 'Insurance Agencies', 1, '{"type": "professional-services", "use_case": "quote-requests"}'),
  ('industry', 'real-estate-agencies', 'Real Estate Agencies', 1, '{"type": "professional-services", "use_case": "property-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Professional services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'financial-advisors', 'Financial Advisors', 2, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'mortgage-brokers', 'Mortgage Brokers', 2, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'tax-consultants', 'Tax Consultants', 2, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'property-management', 'Property Management', 2, '{"type": "professional-services", "use_case": "tenant-inquiries"}'),
  ('industry', 'recruitment-agencies', 'Recruitment Agencies', 2, '{"type": "professional-services", "use_case": "candidate-screening"}'),
  ('industry', 'consulting-firms', 'Consulting Firms', 2, '{"type": "professional-services", "use_case": "consultation-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche professional services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'notaries', 'Notaries', 3, '{"type": "professional-services", "use_case": "appointment-scheduling"}'),
  ('industry', 'patent-attorneys', 'Patent Attorneys', 3, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'immigration-consultants', 'Immigration Consultants', 3, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'architects', 'Architects', 3, '{"type": "professional-services", "use_case": "consultation-booking"}'),
  ('industry', 'surveyors', 'Surveyors', 3, '{"type": "professional-services", "use_case": "quote-requests"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- HOME SERVICES & TRADES
-- ============================================

-- Tier 1: Essential home services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'plumbers', 'Plumbers', 1, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'electricians', 'Electricians', 1, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'hvac-services', 'HVAC Services', 1, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'locksmiths', 'Locksmiths', 1, '{"type": "home-services", "use_case": "emergency-dispatch"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Home services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'cleaning-services', 'Cleaning Services', 2, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'pest-control', 'Pest Control', 2, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'landscaping', 'Landscaping Services', 2, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'roofing', 'Roofing Services', 2, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'painting-contractors', 'Painting Contractors', 2, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'general-contractors', 'General Contractors', 2, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'flooring-services', 'Flooring Services', 2, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'window-cleaning', 'Window Cleaning', 2, '{"type": "home-services", "use_case": "service-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche home services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'carpet-cleaning', 'Carpet Cleaning', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'garage-door-repair', 'Garage Door Repair', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'appliance-repair', 'Appliance Repair', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'pool-services', 'Pool Services', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'handyman-services', 'Handyman Services', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'septic-services', 'Septic Services', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'tree-services', 'Tree Services', 3, '{"type": "home-services", "use_case": "quote-requests"}'),
  ('industry', 'gutter-cleaning', 'Gutter Cleaning', 3, '{"type": "home-services", "use_case": "service-booking"}'),
  ('industry', 'pressure-washing', 'Pressure Washing', 3, '{"type": "home-services", "use_case": "quote-requests"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- AUTOMOTIVE
-- ============================================

-- Tier 1: High volume automotive
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'car-dealerships', 'Car Dealerships', 1, '{"type": "automotive", "use_case": "sales-inquiries"}'),
  ('industry', 'auto-repair-shops', 'Auto Repair Shops', 1, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'towing-services', 'Towing Services', 1, '{"type": "automotive", "use_case": "emergency-dispatch"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Automotive services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'car-rentals', 'Car Rentals', 2, '{"type": "automotive", "use_case": "reservation-booking"}'),
  ('industry', 'tire-shops', 'Tire Shops', 2, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'auto-body-shops', 'Auto Body Shops', 2, '{"type": "automotive", "use_case": "quote-requests"}'),
  ('industry', 'oil-change-services', 'Oil Change Services', 2, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'car-wash', 'Car Wash', 2, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'nct-centres', 'NCT Centres', 2, '{"type": "automotive", "use_case": "appointment-scheduling"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche automotive
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'motorcycle-dealers', 'Motorcycle Dealers', 3, '{"type": "automotive", "use_case": "sales-inquiries"}'),
  ('industry', 'auto-glass', 'Auto Glass Repair', 3, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'detailing-services', 'Auto Detailing', 3, '{"type": "automotive", "use_case": "service-booking"}'),
  ('industry', 'driving-schools', 'Driving Schools', 3, '{"type": "automotive", "use_case": "lesson-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- BEAUTY & WELLNESS
-- ============================================

-- Tier 1: High volume beauty
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'hair-salons', 'Hair Salons', 1, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'barbershops', 'Barbershops', 1, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'spas', 'Spas', 1, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'gyms', 'Gyms & Fitness Centers', 1, '{"type": "beauty-wellness", "use_case": "membership-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Beauty & wellness
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'nail-salons', 'Nail Salons', 2, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'massage-therapy', 'Massage Therapy', 2, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'yoga-studios', 'Yoga Studios', 2, '{"type": "beauty-wellness", "use_case": "class-booking"}'),
  ('industry', 'pilates-studios', 'Pilates Studios', 2, '{"type": "beauty-wellness", "use_case": "class-booking"}'),
  ('industry', 'beauty-clinics', 'Beauty Clinics', 2, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'tanning-salons', 'Tanning Salons', 2, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'waxing-salons', 'Waxing Salons', 2, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche beauty & wellness
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'tattoo-parlors', 'Tattoo Parlors', 3, '{"type": "beauty-wellness", "use_case": "consultation-booking"}'),
  ('industry', 'med-spas', 'Med Spas', 3, '{"type": "beauty-wellness", "use_case": "consultation-booking"}'),
  ('industry', 'laser-hair-removal', 'Laser Hair Removal', 3, '{"type": "beauty-wellness", "use_case": "appointment-scheduling"}'),
  ('industry', 'personal-trainers', 'Personal Trainers', 3, '{"type": "beauty-wellness", "use_case": "session-booking"}'),
  ('industry', 'crossfit-gyms', 'CrossFit Gyms', 3, '{"type": "beauty-wellness", "use_case": "class-booking"}'),
  ('industry', 'martial-arts', 'Martial Arts Schools', 3, '{"type": "beauty-wellness", "use_case": "class-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- EDUCATION & TRAINING
-- ============================================

-- Tier 2: Education services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'tutoring-services', 'Tutoring Services', 2, '{"type": "education", "use_case": "session-booking"}'),
  ('industry', 'language-schools', 'Language Schools', 2, '{"type": "education", "use_case": "enrollment-inquiries"}'),
  ('industry', 'music-schools', 'Music Schools', 2, '{"type": "education", "use_case": "lesson-booking"}'),
  ('industry', 'dance-schools', 'Dance Schools', 2, '{"type": "education", "use_case": "class-booking"}'),
  ('industry', 'training-centres', 'Training Centres', 2, '{"type": "education", "use_case": "course-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche education
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'art-schools', 'Art Schools', 3, '{"type": "education", "use_case": "class-booking"}'),
  ('industry', 'cooking-classes', 'Cooking Classes', 3, '{"type": "education", "use_case": "class-booking"}'),
  ('industry', 'swimming-lessons', 'Swimming Lessons', 3, '{"type": "education", "use_case": "lesson-booking"}'),
  ('industry', 'test-prep', 'Test Prep Services', 3, '{"type": "education", "use_case": "enrollment-inquiries"}'),
  ('industry', 'childcare', 'Childcare Centres', 3, '{"type": "education", "use_case": "enrollment-inquiries"}'),
  ('industry', 'montessori', 'Montessori Schools', 3, '{"type": "education", "use_case": "enrollment-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- TRAVEL & HOSPITALITY
-- ============================================

-- Tier 2: Travel & hospitality
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'travel-agencies', 'Travel Agencies', 2, '{"type": "travel-hospitality", "use_case": "booking-inquiries"}'),
  ('industry', 'bed-and-breakfasts', 'B&Bs', 2, '{"type": "travel-hospitality", "use_case": "reservation-booking"}'),
  ('industry', 'vacation-rentals', 'Vacation Rentals', 2, '{"type": "travel-hospitality", "use_case": "reservation-booking"}'),
  ('industry', 'hostels', 'Hostels', 2, '{"type": "travel-hospitality", "use_case": "reservation-booking"}'),
  ('industry', 'tour-operators', 'Tour Operators', 2, '{"type": "travel-hospitality", "use_case": "booking-inquiries"}'),
  ('industry', 'event-venues', 'Event Venues', 2, '{"type": "travel-hospitality", "use_case": "booking-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche travel
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'golf-courses', 'Golf Courses', 3, '{"type": "travel-hospitality", "use_case": "tee-time-booking"}'),
  ('industry', 'boat-rentals', 'Boat Rentals', 3, '{"type": "travel-hospitality", "use_case": "reservation-booking"}'),
  ('industry', 'camping-sites', 'Camping Sites', 3, '{"type": "travel-hospitality", "use_case": "reservation-booking"}'),
  ('industry', 'ski-resorts', 'Ski Resorts', 3, '{"type": "travel-hospitality", "use_case": "booking-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- RETAIL & E-COMMERCE
-- ============================================

-- Tier 2: Retail
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'florists', 'Florists', 2, '{"type": "retail", "use_case": "order-taking"}'),
  ('industry', 'furniture-stores', 'Furniture Stores', 2, '{"type": "retail", "use_case": "product-inquiries"}'),
  ('industry', 'jewelry-stores', 'Jewelry Stores', 2, '{"type": "retail", "use_case": "product-inquiries"}'),
  ('industry', 'electronics-stores', 'Electronics Stores', 2, '{"type": "retail", "use_case": "product-support"}'),
  ('industry', 'pet-stores', 'Pet Stores', 2, '{"type": "retail", "use_case": "product-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche retail
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'bridal-shops', 'Bridal Shops', 3, '{"type": "retail", "use_case": "appointment-scheduling"}'),
  ('industry', 'optical-stores', 'Optical Stores', 3, '{"type": "retail", "use_case": "appointment-scheduling"}'),
  ('industry', 'mattress-stores', 'Mattress Stores', 3, '{"type": "retail", "use_case": "product-inquiries"}'),
  ('industry', 'appliance-stores', 'Appliance Stores', 3, '{"type": "retail", "use_case": "product-support"}'),
  ('industry', 'wine-shops', 'Wine Shops', 3, '{"type": "retail", "use_case": "order-taking"}'),
  ('industry', 'gift-shops', 'Gift Shops', 3, '{"type": "retail", "use_case": "product-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- PET SERVICES
-- ============================================

-- Tier 2: Pet services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'pet-grooming', 'Pet Grooming', 2, '{"type": "pet-services", "use_case": "appointment-scheduling"}'),
  ('industry', 'pet-boarding', 'Pet Boarding', 2, '{"type": "pet-services", "use_case": "reservation-booking"}'),
  ('industry', 'dog-walking', 'Dog Walking Services', 2, '{"type": "pet-services", "use_case": "service-booking"}'),
  ('industry', 'pet-sitting', 'Pet Sitting', 2, '{"type": "pet-services", "use_case": "service-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche pet services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'dog-training', 'Dog Training', 3, '{"type": "pet-services", "use_case": "session-booking"}'),
  ('industry', 'pet-photography', 'Pet Photography', 3, '{"type": "pet-services", "use_case": "session-booking"}'),
  ('industry', 'mobile-pet-grooming', 'Mobile Pet Grooming', 3, '{"type": "pet-services", "use_case": "appointment-scheduling"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- LOGISTICS & MOVING
-- ============================================

-- Tier 2: Logistics
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'moving-companies', 'Moving Companies', 2, '{"type": "logistics", "use_case": "quote-requests"}'),
  ('industry', 'courier-services', 'Courier Services', 2, '{"type": "logistics", "use_case": "pickup-scheduling"}'),
  ('industry', 'storage-facilities', 'Storage Facilities', 2, '{"type": "logistics", "use_case": "rental-inquiries"}'),
  ('industry', 'delivery-services', 'Delivery Services', 2, '{"type": "logistics", "use_case": "tracking-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche logistics
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'junk-removal', 'Junk Removal', 3, '{"type": "logistics", "use_case": "quote-requests"}'),
  ('industry', 'shipping-services', 'Shipping Services', 3, '{"type": "logistics", "use_case": "tracking-inquiries"}'),
  ('industry', 'freight-services', 'Freight Services', 3, '{"type": "logistics", "use_case": "quote-requests"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- ENTERTAINMENT & EVENTS
-- ============================================

-- Tier 2: Entertainment
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'photographers', 'Photographers', 2, '{"type": "entertainment", "use_case": "session-booking"}'),
  ('industry', 'videographers', 'Videographers', 2, '{"type": "entertainment", "use_case": "session-booking"}'),
  ('industry', 'event-planners', 'Event Planners', 2, '{"type": "entertainment", "use_case": "consultation-booking"}'),
  ('industry', 'dj-services', 'DJ Services', 2, '{"type": "entertainment", "use_case": "booking-inquiries"}'),
  ('industry', 'caterers', 'Caterers', 2, '{"type": "entertainment", "use_case": "quote-requests"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche entertainment
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'wedding-planners', 'Wedding Planners', 3, '{"type": "entertainment", "use_case": "consultation-booking"}'),
  ('industry', 'party-rentals', 'Party Rentals', 3, '{"type": "entertainment", "use_case": "rental-inquiries"}'),
  ('industry', 'photo-booths', 'Photo Booth Rentals', 3, '{"type": "entertainment", "use_case": "booking-inquiries"}'),
  ('industry', 'live-bands', 'Live Bands', 3, '{"type": "entertainment", "use_case": "booking-inquiries"}'),
  ('industry', 'magicians', 'Magicians', 3, '{"type": "entertainment", "use_case": "booking-inquiries"}'),
  ('industry', 'escape-rooms', 'Escape Rooms', 3, '{"type": "entertainment", "use_case": "reservation-booking"}'),
  ('industry', 'bowling-alleys', 'Bowling Alleys', 3, '{"type": "entertainment", "use_case": "reservation-booking"}'),
  ('industry', 'cinemas', 'Cinemas', 3, '{"type": "entertainment", "use_case": "ticket-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- TECH & IT SERVICES
-- ============================================

-- Tier 2: Tech services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'it-support', 'IT Support', 2, '{"type": "tech", "use_case": "support-tickets"}'),
  ('industry', 'computer-repair', 'Computer Repair', 2, '{"type": "tech", "use_case": "service-booking"}'),
  ('industry', 'phone-repair', 'Phone Repair', 2, '{"type": "tech", "use_case": "service-booking"}'),
  ('industry', 'web-agencies', 'Web Design Agencies', 2, '{"type": "tech", "use_case": "consultation-booking"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche tech
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'data-recovery', 'Data Recovery', 3, '{"type": "tech", "use_case": "service-inquiries"}'),
  ('industry', 'cybersecurity', 'Cybersecurity Services', 3, '{"type": "tech", "use_case": "consultation-booking"}'),
  ('industry', 'saas-companies', 'SaaS Companies', 3, '{"type": "tech", "use_case": "sales-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- FUNERAL & MEMORIAL
-- ============================================

-- Tier 2: Funeral services
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'funeral-homes', 'Funeral Homes', 2, '{"type": "funeral", "use_case": "arrangement-inquiries"}'),
  ('industry', 'crematoriums', 'Crematoriums', 3, '{"type": "funeral", "use_case": "service-inquiries"}'),
  ('industry', 'memorial-services', 'Memorial Services', 3, '{"type": "funeral", "use_case": "arrangement-inquiries"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- SECURITY SERVICES
-- ============================================

-- Tier 2: Security
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'security-companies', 'Security Companies', 2, '{"type": "security", "use_case": "quote-requests"}'),
  ('industry', 'alarm-companies', 'Alarm Companies', 2, '{"type": "security", "use_case": "service-inquiries"}'),
  ('industry', 'cctv-installers', 'CCTV Installers', 3, '{"type": "security", "use_case": "quote-requests"}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- SUMMARY
-- ============================================
-- Total new industries added: ~130+
-- Categories: Healthcare, Professional Services, Home Services,
--            Automotive, Beauty & Wellness, Education, Travel,
--            Retail, Pet Services, Logistics, Entertainment,
--            Tech, Funeral, Security
