
import { z } from "zod";

/**
 * Re-export FirestorePermissionError for components that expect it in lib/types
 */
export { FirestorePermissionError } from "@/firebase/errors";

// Star Costs Constants
export const STAR_COSTS = {
  AI_MESSAGE: 5,
  MAP_VIEW: 3,
  ROAD_VERIFY: 1,
  ROUTE_PLAN: 4,
  ALERTS_DAILY: 2,
  EXPORT_REPORT: 10,
  SIGNUP_BONUS: 25,
  NAVIGATION_SESSION: 3,
  REPORT_HAZARD_REWARD: 10,
} as const;

// App Navigation Features
export const navFeatures = [
  'reports', 'liveTraffic', 'localTraffic', 'map', 'hazardMap', 'assistant', 'notifications', 'myStars', 'report', 'police', 
  'routes', 'announcements', 'logement', 'transport', 'carRental', 'tourism', 
  'events', 'videos', 'kinshasa', 'restaurants', 'contact', 'share', 'fluxInfrastructure', 'kFlowNav', 'insights', 'communityChat'
] as const;
export type NavFeature = typeof navFeatures[number];

export const appNavigationSettingsSchema = z.object({
  reports: z.boolean().default(true),
  liveTraffic: z.boolean().default(true),
  localTraffic: z.boolean().default(true),
  map: z.boolean().default(true),
  hazardMap: z.boolean().default(true),
  assistant: z.boolean().default(true),
  notifications: z.boolean().default(true),
  myStars: z.boolean().default(true),
  report: z.boolean().default(true),
  police: z.boolean().default(true),
  routes: z.boolean().default(true),
  announcements: z.boolean().default(true),
  logement: z.boolean().default(true),
  transport: z.boolean().default(true),
  carRental: z.boolean().default(true),
  tourism: z.boolean().default(true),
  events: z.boolean().default(true),
  videos: z.boolean().default(true),
  kinshasa: z.boolean().default(true),
  restaurants: z.boolean().default(true),
  contact: z.boolean().default(true),
  share: z.boolean().default(true),
  fluxInfrastructure: z.boolean().default(true),
  kFlowNav: z.boolean().default(true),
  insights: z.boolean().default(true),
  communityChat: z.boolean().default(true),
});
export type AppNavigationSettings = z.infer<typeof appNavigationSettingsSchema>;

export interface AppSubscriptionSettings {
  mode: 'stars' | 'cash';
  lastUpdated?: any;
}

// Community Chat
export interface CommunityMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  locationName?: string;
  coords?: {
    lat: number;
    lng: number;
  };
  alertType?: 'travaux' | 'police' | 'embouteillage';
  likes?: number;
  commentCount?: number;
  timestamp: any;
}

export interface ChatComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: any;
}

// Road Condition Reports
export const roadConditionTypeSchema = z.enum(["pothole", "blockage", "police", "damaged_road"]);
export type RoadConditionType = z.infer<typeof roadConditionTypeSchema>;

export const roadConditionReportSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  type: roadConditionTypeSchema,
  description: z.string(),
  imageUrl: z.string().optional(),
  locationName: z.string(),
  coords: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  votes: z.number().default(0),
  status: z.enum(["active", "expired"]).default("active"),
  createdAt: z.any(),
});
export type RoadConditionReport = z.infer<typeof roadConditionReportSchema>;

export const reportHazardFormSchema = z.object({
  type: roadConditionTypeSchema,
  description: z.string().min(5, "Description trop courte"),
  image: z.any().optional(),
});
export type ReportHazardFormValues = z.infer<typeof reportHazardFormSchema>;

// Traffic Incident Reports (Community)
export const reportFormSchema = z.object({
  location: z.string().min(2, "Le lieu est requis"),
  description: z.string().min(5, "La description est trop courte"),
  severity: z.enum(["low", "medium", "high"]),
  picture: z.any().optional(),
});
export type ReportFormValues = z.infer<typeof reportFormSchema>;

// User profile
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  photoURL: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  currentStarsBalance: z.number().default(0),
  totalStarsEarned: z.number().default(0),
  totalStarsPurchased: z.number().default(0),
  totalStarsUsed: z.number().default(0),
  lastLoginTimestamp: z.any().optional(),
  consecutiveLoginDays: z.number().default(0),
  referralCode: z.string().optional(),
  isProfileComplete: z.boolean().default(false),
  isBlocked: z.boolean().default(false),
  isCashSubscribed: z.boolean().default(false),
  cashSubscriptionExpiry: z.any().optional(),
  hasUsedFreeTrial: z.boolean().default(false),
  createdAt: z.any().optional(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export type WithId<T> = T & { id: string };

export const loginSchema = z.object({
  email: z.string().email({ message: "Veuillez entrer une adresse e-mail valide." }),
  password: z.string().min(1, { message: "Veuillez entrer votre mot de passe." }),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().min(2, { message: "Le nom doit comporter au moins 2 caractères." }),
  email: z.string().email({ message: "Veuillez entrer une adresse e-mail valide." }),
  password: z.string().min(8, { message: "Le mot de passe doit comporter au moins 8 caractères." }),
  phone: z.string().min(9, { message: "Veuillez entrer un numéro de téléphone valide." }),
  city: z.string().min(2, { message: "Veuillez entrer votre ville." }),
  country: z.string().min(2, { message: "Veuillez entrer votre pays." }),
});
export type SignupValues = z.infer<typeof signupSchema>;

// Assistant AI
export const AssistantInputSchema = z.object({
  question: z.string(),
});
export type AssistantInput = z.infer<typeof AssistantInputSchema>;

export const AssistantOutputSchema = z.object({
  answer: z.string(),
  relatedRoute: z.any().optional(),
});
export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// Strategic Insights
export const StrategicInsightsInputSchema = z.object({
  axes: z.array(z.object({
    road: z.string(),
    status: z.string(),
    delay: z.number(),
    speed: z.number(),
  })),
});
export type StrategicInsightsInput = z.infer<typeof StrategicInsightsInputSchema>;

export const StrategicInsightsOutputSchema = z.object({
  globalAdvice: z.string(),
  tips: z.array(z.string()),
  trend: z.enum(['amélioration', 'stable', 'dégradation']),
});
export type StrategicInsightsOutput = z.infer<typeof StrategicInsightsOutputSchema>;

// Traffic Tips
export const TrafficTipsInputSchema = z.object({
  location: z.string(),
  description: z.string(),
});
export type TrafficTipsInput = z.infer<typeof TrafficTipsInputSchema>;

export const TrafficTipsOutputSchema = z.object({
  tips: z.array(z.string()),
});
export type TrafficTipsOutput = z.infer<typeof TrafficTipsOutputSchema>;

// MBiyoPay & Adverts
export const advertUploadFormSchema = z.object({
  title: z.string().min(3),
  video: z.any(),
});
export type AdvertUploadFormValues = z.infer<typeof advertUploadFormSchema>;

export interface AdvertVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  createdAt: any;
}

export interface StarTransaction {
  id: string;
  userId: string;
  type: 'earned' | 'spent' | 'purchase' | 'admin_adjustment';
  starsChange: number;
  balanceAfterTransaction: number;
  description: string;
  timestamp: any;
  relatedObjectId?: string;
  relatedObjectType?: string;
}

// Car Rental
export const carBookingFormSchema = z.object({
  userName: z.string().min(2),
  userPhone: z.string().min(9),
  userAddress: z.string().min(5),
  numberOfDays: z.number().min(1),
});
export type CarBookingFormValues = z.infer<typeof carBookingFormSchema>;

export interface CarBooking {
  id: string;
  userId: string;
  carId: string;
  carName: string;
  userName: string;
  userPhone: string;
  userAddress: string;
  numberOfDays: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: any;
}

// Contact
export const inquiryFormSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(9),
  subject: z.string().min(3),
  message: z.string().min(10),
  type: z.enum(['inquiry', 'suggestion', 'complaint']),
});
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;

export interface Inquiry {
  id: string;
  userId: string;
  userEmail?: string | null;
  fullName: string;
  phone: string;
  subject: string;
  message: string;
  type: 'inquiry' | 'suggestion' | 'complaint';
  createdAt: any;
}

// Logement
export const logementFormSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  address: z.string().min(5),
  pricePerMonth: z.coerce.number().positive(),
  amenities: z.string(),
  images: z.any().optional(),
});
export type LogementFormValues = z.infer<typeof logementFormSchema>;

export const editLogementFormSchema = logementFormSchema.omit({ images: true });
export type EditLogementFormValues = z.infer<typeof editLogementFormSchema>;

export const logementApplicationFormSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  address: z.string().min(5),
  city: z.string().min(2),
  country: z.string().min(2),
  whatsapp: z.string().optional(),
});
export type LogementApplicationFormValues = z.infer<typeof logementApplicationFormSchema>;

export interface Logement {
  id: string;
  title: string;
  description: string;
  address: string;
  pricePerMonth: number;
  amenities: string[];
  imageUrls: string[];
  ownerId: string;
  createdAt: any;
}

export interface LogementApplication {
  id: string;
  logementId: string;
  logementTitle: string;
  applicantId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  whatsapp?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

// Tourism
export const tourismEventFormSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  location: z.string().min(5),
  price: z.coerce.number().nonnegative(),
  category: z.string(),
  images: z.any().optional(),
  whatsapp: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
export type TourismEventFormValues = z.infer<typeof tourismEventFormSchema>;

export const tourismBookingFormSchema = z.object({
  userName: z.string().min(2),
  userPhone: z.string().min(9),
  numberOfPeople: z.coerce.number().min(1),
});
export type TourismBookingFormValues = z.infer<typeof tourismBookingFormSchema>;

export interface TourismEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  price: number;
  category: string;
  imageUrls: string[];
  whatsapp?: string;
  phone?: string;
  email?: string;
  createdAt: any;
}

export interface TourismBooking {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  userName: string;
  userPhone: string;
  numberOfPeople: number;
  status: 'pending' | 'confirmed';
  createdAt: any;
}

// Transport
export const transportSubscriptionFormSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  address: z.string().min(5),
  district: z.string().min(2),
  city: z.string().min(2),
  workplace: z.string().min(5),
  departureTime: z.string(),
  returnTime: z.string(),
});
export type TransportSubscriptionFormValues = z.infer<typeof transportSubscriptionFormSchema>;

export interface TransportSubscription {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  district: string;
  city: string;
  workplace: string;
  departureTime: string;
  returnTime: string;
  status: 'pending' | 'approved' | 'active' | 'rejected' | 'cancelled';
  price?: number;
  rejectionReason?: string;
  carType?: string;
  carColor?: string;
  licensePlate?: string;
  driverName?: string;
  driverPhone?: string;
  subscriptionDate?: any;
  createdAt: any;
}

// Video Feed
export const videoUploadFormSchema = z.object({
  title: z.string().min(3),
  video: z.any(),
});
export type VideoUploadFormValues = z.infer<typeof videoUploadFormSchema>;

export interface Video {
  id: string;
  userId: string;
  user: string;
  userAvatar: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
  createdAt: any;
}

export interface Comment {
  id: string;
  userId: string;
  author: string;
  avatar: string;
  text: string;
  createdAt: any;
}

// General UI
export interface AppNotification {
  id: string;
  type: 'user_joined' | 'traffic_report' | 'video_added' | 'system_alert';
  title: string;
  message: string;
  timestamp: any;
  userId: string;
  link?: string;
}

export interface EventReport {
  id: string;
  userId: string;
  user: string;
  userAvatar: string;
  location: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  picture?: string;
  createdAt: any;
}

export interface PoliceReport {
  id: string;
  location: string;
  type: 'control' | 'traffic_management' | 'incident';
  note: string;
  timestamp: any;
}

export interface PoliceStation {
  commune: string;
  name: string;
  phone: string;
  address: string;
}

export interface DailyTrafficReport {
  id: string;
  timestamp: any;
  globalSaturation: number;
  axisStats: {
    road: string;
    status: string;
    speed: number;
    delay: number;
    vehicleCount?: number;
    capacity?: number;
  }[];
}

export interface Restaurant {
  id: string;
  name: string;
  commune: string;
  address: string;
  rating: number;
  cuisine: string;
  priceRange: string;
  image: string;
  coords: { lat: number, lng: number };
}

export interface PushSubscription {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}
