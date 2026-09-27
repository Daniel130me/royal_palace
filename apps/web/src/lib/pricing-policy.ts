import type { Provider, Service, ServicePrice } from "@/types";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-NG");
}

export function isConsultationServiceForSpecialty(
  serviceName: string,
  specialty: string,
): boolean {
  return normalized(serviceName).includes(normalized(specialty));
}

export function activeServicePrice(
  service?: Service | null,
): ServicePrice | undefined {
  let latest: ServicePrice | undefined;
  for (const price of service?.prices ?? []) {
    if (
      price.status === "active" &&
      (!latest || new Date(price.effectiveFrom) > new Date(latest.effectiveFrom))
    ) {
      latest = price;
    }
  }
  return latest;
}

export function providerConsultationService(
  provider: Provider,
  services: Service[],
): Service | undefined {
  return services.find(
    (service) =>
      service.category === "consultation" &&
      isConsultationServiceForSpecialty(service.name, provider.specialty),
  );
}

export function patientConsultationTotal(
  provider: Provider,
  services: Service[],
): number {
  return (
    activeServicePrice(providerConsultationService(provider, services))
      ?.patientPrice ?? provider.consultationFee
  );
}
