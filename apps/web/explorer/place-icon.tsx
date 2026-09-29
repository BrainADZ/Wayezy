import {
  Accessibility,
  Banknote,
  Info,
  Shirt,
  Store,
  Utensils,
  Brush,
  Gem,
  Smartphone,
  Landmark,
  Footprints,
  ShoppingBag,
  Star,
  Car,
  Baby,
  Cross,
  DoorOpen,
  LogOut,
  Headphones,
  PersonStanding,
} from 'lucide-react';
import type { MapPlace } from './explorer-model';

export function PlaceIcon({ place, size = 20 }: { place: MapPlace; size?: number }) {
  if (place.poi) {
    const AmenityIcon = (
      {
        ATM: Banknote,
        Information: Info,
        Parking: Car,
        BabyCare: Baby,
        FirstAid: Cross,
        Entrance: DoorOpen,
        Exit: LogOut,
        CustomerCare: Headphones,
        PrayerRoom: PersonStanding,
        Taxi: Car,
        AccessibleWashroom: Accessibility,
      } as Record<string, typeof Info>
    )[place.poi.type];
    if (AmenityIcon) return <AmenityIcon size={size} aria-hidden="true" />;
    if (place.poi.type === 'Washroom')
      return <img src="/icons/way/washroom.svg" width={size} height={size} alt="" />;
  }
  const referenceIcon =
    place.id === 'ref-scotiabank'
      ? Landmark
      : ['ref-fossil', 'ref-peoples', 'ref-michael-hill'].includes(place.id)
        ? Gem
        : ['ref-foot-locker', 'ref-kids-footlocker', 'ref-spring'].includes(place.id)
          ? Footprints
          : place.id === 'ref-stitch-it'
            ? Star
            : place.categoryId === 'beauty'
              ? Brush
              : place.categoryId === 'electronics'
                ? Smartphone
                : ['ref-chanel', 'ref-marciano', 'ref-attrattivo', 'ref-soft-moc'].includes(
                      place.id,
                    )
                  ? ShoppingBag
                  : null;
  if (referenceIcon) {
    const Icon = referenceIcon;
    return <Icon size={size} aria-hidden="true" />;
  }
  const Icon =
    place.category === 'ATM'
      ? Banknote
      : place.category === 'Information'
        ? Info
        : place.kind === 'poi'
          ? Accessibility
          : place.categoryId === 'fashion'
            ? Shirt
            : place.categoryId === 'dining'
              ? Utensils
              : Store;
  return <Icon size={size} aria-hidden="true" />;
}
