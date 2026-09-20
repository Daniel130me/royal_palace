// Royal Palace Health Care — prototype seed data
// Seeds the complete Amina → Dr Tunde → MedLab → Grace Pharmacy → SwiftCare
// connected-care story so reviewers see a populated app immediately.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const now = new Date();
const iso = (d: Date) => d.toISOString();
const today = (offsetDays = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const nowPlusDays = (offsetDays: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

async function main() {
  // -----------------------------------------------------------------------
  // IDEMPOTENT RESET
  // Wipe every table in foreign-key-safe order (children before parents) so
  // the seed can be re-run at any time without unique-constraint collisions.
  // SQLite FK enforcement is on, so this ordering matters.
  // -----------------------------------------------------------------------
  await db.supportTicketMessage.deleteMany();
  await db.supportTicket.deleteMany();
  await db.managerEarning.deleteMany();
  await db.patientActivityPayment.deleteMany();
  await db.managerRevenueShareRule.deleteMany();
  await db.managerPatientApplication.deleteMany();
  await db.managerOrganizationApplication.deleteMany();
  await db.managerAssignment.deleteMany();
  await db.managerBankAccount.deleteMany();
  await db.organizationPayment.deleteMany();
  await db.manager.deleteMany();
  await db.uploadedPrescription.deleteMany();
  await db.complaint.deleteMany();
  await db.rating.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.payoutRequest.deleteMany();
  await db.settlement.deleteMany();
  await db.payment.deleteMany();
  await db.carePlan.deleteMany();
  await db.diagnosis.deleteMany();
  await db.consent.deleteMany();
  await db.recordAccessGrant.deleteMany();
  await db.referral.deleteMany();
  await db.delivery.deleteMany();
  await db.pharmacyOrderItem.deleteMany();
  await db.pharmacyOrder.deleteMany();
  await db.laboratoryResult.deleteMany();
  await db.laboratoryBooking.deleteMany();
  await db.laboratoryRequest.deleteMany();
  await db.prescriptionItem.deleteMany();
  await db.prescription.deleteMany();
  await db.clinicalEncounter.deleteMany();
  await db.appointment.deleteMany();
  await db.servicePrice.deleteMany();
  await db.service.deleteMany();
  await db.providerApplication.deleteMany();
  await db.pharmacyProduct.deleteMany();
  await db.hospitalService.deleteMany();
  await db.hospital.deleteMany();
  await db.pharmacy.deleteMany();
  await db.laboratory.deleteMany();
  await db.logisticsProvider.deleteMany();
  await db.provider.deleteMany();
  await db.patient.deleteMany();
  await db.user.deleteMany();

  // -----------------------------------------------------------------------
  // USERS + ROLE PROFILES
  // -----------------------------------------------------------------------
  await db.user.create({
    data: {
      id: "USR-ADMIN",
      email: "admin@demo.com",
      password: "demo123",
      role: "admin",
      status: "active",
      profileId: "ADM-001",
      name: "Royal Palace Admin",
    },
  });

  const aminaUser = await db.user.create({
    data: {
      id: "USR-PAT-001",
      email: "amina@demo.com",
      password: "demo123",
      role: "patient",
      status: "active",
      profileId: "PAT-001",
      name: "Amina Bello",
    },
  });

  await db.user.create({
    data: {
      id: "USR-DOC-001",
      email: "doctor@demo.com",
      password: "demo123",
      role: "doctor",
      status: "active",
      profileId: "PRO-001",
      name: "Dr. Tunde Adeyemi",
    },
  });

  await db.user.create({
    data: {
      id: "USR-DOC-002",
      email: "doctor2@demo.com",
      password: "demo123",
      role: "doctor",
      status: "active",
      profileId: "PRO-002",
      name: "Dr. Funmi Okafor",
    },
  });

  await db.user.create({
    data: {
      id: "USR-DOC-003",
      email: "doctor3@demo.com",
      password: "demo123",
      role: "doctor",
      status: "active",
      profileId: "PRO-003",
      name: "Dr. Chidi Nwosu",
    },
  });

  await db.user.create({
    data: {
      id: "USR-PHA-001",
      email: "pharmacy@demo.com",
      password: "demo123",
      role: "pharmacy",
      status: "active",
      profileId: "PHA-001",
      name: "Grace Community Pharmacy",
    },
  });

  await db.user.create({
    data: {
      id: "USR-LAB-001",
      email: "lab@demo.com",
      password: "demo123",
      role: "laboratory",
      status: "active",
      profileId: "LAB-001",
      name: "MedLab Diagnostics",
    },
  });

  await db.user.create({
    data: {
      id: "USR-LOG-001",
      email: "logistics@demo.com",
      password: "demo123",
      role: "logistics",
      status: "active",
      profileId: "LOG-001",
      name: "SwiftCare Logistics",
    },
  });

  // -----------------------------------------------------------------------
  // PATIENT — Amina Bello (primary) + a dependant
  // -----------------------------------------------------------------------
  await db.patient.create({
    data: {
      id: "PAT-001",
      userId: aminaUser.id,
      patientNumber: "RPH-2026-0001",
      firstName: "Amina",
      lastName: "Bello",
      dateOfBirth: "1992-03-14",
      gender: "Female",
      phone: "+234 803 555 0101",
      email: "amina@demo.com",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      bloodGroup: "O+",
      genotype: "AA",
      height: 165,
      weight: 68,
      allergies: JSON.stringify([
        { name: "Penicillin", source: "provider-confirmed", status: "active", recordedAt: iso(now) },
        { name: "Sulphur drugs", source: "patient-reported", status: "active", recordedAt: iso(now) },
      ]),
      conditions: JSON.stringify([
        { name: "Hypertension (Stage 1)", source: "provider-confirmed", status: "active", recordedAt: iso(now) },
        { name: "Migraine", source: "patient-reported", status: "active", recordedAt: iso(now) },
      ]),
      medications: JSON.stringify([
        { name: "Amlodipine 10mg", source: "provider-confirmed", status: "active", recordedAt: iso(now) },
      ]),
      emergencyName: "Yusuf Bello",
      emergencyPhone: "+234 803 555 0190",
      emergencyRel: "Spouse",
    },
  });

  // Dependant — Zainab (daughter)
  await db.patient.create({
    data: {
      id: "PAT-002",
      userId: aminaUser.id,
      parentPatientId: "PAT-001",
      patientNumber: "RPH-2026-0002",
      firstName: "Zainab",
      lastName: "Bello",
      dateOfBirth: "2016-08-22",
      gender: "Female",
      phone: "+234 803 555 0101",
      email: "amina@demo.com",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      bloodGroup: "A+",
      genotype: "AA",
      height: 115,
      weight: 22,
      allergies: JSON.stringify([]),
      conditions: JSON.stringify([
        { name: "Childhood asthma (mild)", source: "provider-confirmed", status: "active", recordedAt: iso(now) },
      ]),
      medications: JSON.stringify([]),
      emergencyName: "Amina Bello",
      emergencyPhone: "+234 803 555 0101",
      emergencyRel: "Mother",
    },
  });

  // -----------------------------------------------------------------------
  // PROVIDERS — Dr Tunde (GP, verified) + Dr Funmi (Cardiologist, verified)
  // -----------------------------------------------------------------------
  await db.provider.create({
    data: {
      id: "PRO-001",
      userId: "USR-DOC-001",
      providerNumber: "RPH-PRO-0001",
      firstName: "Tunde",
      lastName: "Adeyemi",
      title: "Dr.",
      specialty: "General Practitioner",
      professionalTitle: "MBBS, FWACP (Family Medicine)",
      qualifications: JSON.stringify(["MBBS — University of Lagos", "FWACP — Family Medicine", "BLS & ACLS certified"]),
      yearsExperience: 12,
      biography:
        "Dr. Tunde Adeyemi is a trusted General Practitioner with over a decade of experience in family medicine, chronic disease management and preventive care across Lagos.",
      languages: JSON.stringify(["English", "Yoruba", "Hausa"]),
      registrationNumber: "MDG/LAG/2010/00451",
      licenceNumber: "MDCN-LAG-2010-2291",
      licenceExpiry: "2027-12-31",
      verificationStatus: "approved",
      consultationModes: JSON.stringify(["video", "audio", "chat"]),
      city: "Ikeja",
      state: "Lagos",
      rating: 4.8,
      reviewCount: 127,
      consultationFee: 15000,
    },
  });

  await db.provider.create({
    data: {
      id: "PRO-002",
      userId: "USR-DOC-002",
      providerNumber: "RPH-PRO-0002",
      firstName: "Funmi",
      lastName: "Okafor",
      title: "Dr.",
      specialty: "Cardiologist",
      professionalTitle: "MBBS, FWACP (Cardiology)",
      qualifications: JSON.stringify(["MBBS — University of Ibadan", "FWACP — Cardiology", "Fellow, Nigerian Cardiac Society"]),
      yearsExperience: 15,
      biography:
        "Dr. Funmi Okafor is a senior Cardiologist specialising in hypertension, heart failure and preventive cardiology for adults.",
      languages: JSON.stringify(["English", "Yoruba"]),
      registrationNumber: "MDG/IBD/2007/00820",
      licenceNumber: "MDCN-IBD-2007-1180",
      licenceExpiry: "2026-08-31",
      verificationStatus: "approved",
      consultationModes: JSON.stringify(["video"]),
      city: "Yaba",
      state: "Lagos",
      rating: 4.9,
      reviewCount: 89,
      consultationFee: 25000,
    },
  });

  // A pending provider application to be reviewed by admin
  await db.provider.create({
    data: {
      id: "PRO-003",
      userId: "USR-DOC-003",
      providerNumber: "RPH-PRO-0003",
      firstName: "Chidi",
      lastName: "Nwosu",
      title: "Dr.",
      specialty: "Paediatrician",
      professionalTitle: "MBBS, FWACP (Paediatrics)",
      qualifications: JSON.stringify(["MBBS — University of Nigeria Nsukka"]),
      yearsExperience: 6,
      biography: "Dr. Chidi Nwosu is a paediatrician applying to join the Royal Palace network.",
      languages: JSON.stringify(["English", "Igbo"]),
      registrationNumber: "MDG/ENU/2018/01112",
      licenceNumber: "MDCN-ENU-2018-5521",
      licenceExpiry: "2028-06-30",
      verificationStatus: "submitted",
      consultationModes: JSON.stringify(["video"]),
      city: "Surulere",
      state: "Lagos",
      rating: 0,
      reviewCount: 0,
      consultationFee: 18000,
    },
  });

  await db.providerApplication.create({
    data: {
      id: "APP-001",
      providerId: "PRO-003",
      status: "under_review",
      submittedAt: nowPlusDays(-3),
      documents: JSON.stringify([
        { id: "FILE-001", name: "medical-licence.pdf", type: "application/pdf", size: 184000, uploadedAt: iso(now) },
        { id: "FILE-002", name: "degree-certificate.pdf", type: "application/pdf", size: 220000, uploadedAt: iso(now) },
      ]),
      history: JSON.stringify([
        { status: "submitted", at: nowPlusDays(-3), by: "Dr. Chidi Nwosu", note: "Application submitted" },
      ]),
    },
  });

  // -----------------------------------------------------------------------
  // PHARMACY — Grace Community Pharmacy
  // -----------------------------------------------------------------------
  await db.pharmacy.create({
    data: {
      id: "PHA-001",
      userId: "USR-PHA-001",
      pharmacyNumber: "RPH-PHA-0001",
      name: "Grace Community Pharmacy",
      city: "Lekki",
      state: "Lagos",
      address: "12 Admiralty Way, Lekki Phase 1, Lagos",
      phone: "+234 805 222 0101",
      email: "pharmacy@demo.com",
      verificationStatus: "approved",
      commissionPct: 8,
      rating: 4.6,
    },
  });

  const products = [
    // controlled — requires a doctor's prescription, cannot be ordered directly
    { id: "MED-001", name: "Amoxicillin", genericName: "Amoxicillin", brand: "Amoxil", category: "Antibiotic", strength: "500mg", dosageForm: "Capsule", manufacturer: "GSK", price: 4500, stock: 38, batch: "AMX2026A", expiry: "2027-05-01", controlled: true },
    { id: "MED-002", name: "Amlodipine", genericName: "Amlodipine", brand: "Norvasc", category: "Antihypertensive", strength: "10mg", dosageForm: "Tablet", manufacturer: "Pfizer", price: 6000, stock: 52, batch: "AML2026B", expiry: "2027-08-01", controlled: true },
    // uncontrolled — OTC, can be ordered directly by patients
    { id: "MED-003", name: "Paracetamol", genericName: "Paracetamol", brand: "Panadol", category: "Over-the-Counter", strength: "500mg", dosageForm: "Tablet", manufacturer: "Emzor", price: 1200, stock: 200, batch: "PAR2026C", expiry: "2028-01-01", prescriptionRequired: false, controlled: false },
    { id: "MED-004", name: "Lisinopril", genericName: "Lisinopril", brand: "Zestril", category: "Antihypertensive", strength: "20mg", dosageForm: "Tablet", manufacturer: "AstraZeneca", price: 7500, stock: 28, batch: "LIS2026D", expiry: "2027-03-01", controlled: true },
    { id: "MED-005", name: "Metformin", genericName: "Metformin", brand: "Glucophage", category: "Antidiabetic", strength: "850mg", dosageForm: "Tablet", manufacturer: "Merck", price: 5200, stock: 14, batch: "MET2025E", expiry: "2026-09-15", controlled: true },
    { id: "MED-006", name: "Cetirizine", genericName: "Cetirizine", brand: "Zyrtec", category: "Over-the-Counter", strength: "10mg", dosageForm: "Tablet", manufacturer: "Johnson & Johnson", price: 2800, stock: 6, batch: "CET2024F", expiry: "2026-02-20", prescriptionRequired: false, controlled: false },
    { id: "MED-007", name: "Vitamin C", genericName: "Ascorbic Acid", brand: "Ceeplus", category: "Supplement", strength: "1000mg", dosageForm: "Tablet", manufacturer: "Emzor", price: 1800, stock: 120, batch: "VIT2026G", expiry: "2028-06-01", prescriptionRequired: false, controlled: false },
    { id: "MED-008", name: "ORS", genericName: "Oral Rehydration Salts", brand: "Dioralyte", category: "Over-the-Counter", strength: "20.5g", dosageForm: "Sachet", manufacturer: "Sanofi", price: 950, stock: 80, batch: "ORS2026H", expiry: "2027-12-01", prescriptionRequired: false, controlled: false },
  ] as const;
  for (const p of products) {
    await db.pharmacyProduct.create({
      data: {
        id: p.id,
        pharmacyId: "PHA-001",
        name: p.name,
        genericName: p.genericName,
        brand: p.brand,
        category: p.category,
        strength: p.strength,
        dosageForm: p.dosageForm,
        manufacturer: p.manufacturer,
        price: p.price,
        stockQuantity: p.stock,
        batch: p.batch,
        expiryDate: p.expiry,
        prescriptionRequired: (p as { prescriptionRequired?: boolean }).prescriptionRequired ?? true,
        controlled: (p as { controlled?: boolean }).controlled ?? false,
        storageRequirements: "Store below 25°C",
        status: "active",
      },
    });
  }

  // -----------------------------------------------------------------------
  // LABORATORY — MedLab Diagnostics
  // -----------------------------------------------------------------------
  await db.laboratory.create({
    data: {
      id: "LAB-001",
      userId: "USR-LAB-001",
      laboratoryNumber: "RPH-LAB-0001",
      name: "MedLab Diagnostics",
      city: "Ikeja",
      state: "Lagos",
      address: "5 Allen Avenue, Ikeja, Lagos",
      phone: "+234 805 333 0101",
      email: "lab@demo.com",
      verificationStatus: "approved",
      rating: 4.7,
    },
  });

  // -----------------------------------------------------------------------
  // LOGISTICS — SwiftCare
  // -----------------------------------------------------------------------
  await db.logisticsProvider.create({
    data: {
      id: "LOG-001",
      userId: "USR-LOG-001",
      logisticsNumber: "RPH-LOG-0001",
      name: "SwiftCare Logistics",
      vehicleType: "Motorcycle",
      city: "Lekki",
      state: "Lagos",
      phone: "+234 805 444 0101",
      email: "logistics@demo.com",
      verificationStatus: "approved",
    },
  });

  // -----------------------------------------------------------------------
  // SERVICES & PRICING (platform-controlled)
  // -----------------------------------------------------------------------
  const services = [
    { id: "SRV-CONSULT-GP", category: "consultation", name: "General Practitioner Consultation", patientPrice: 15000, payout: 11000 },
    { id: "SRV-CONSULT-CARD", category: "consultation", name: "Cardiologist Consultation", patientPrice: 25000, payout: 18500 },
    { id: "SRV-CONSULT-PAED", category: "consultation", name: "Paediatrician Consultation", patientPrice: 18000, payout: 13500 },
    { id: "SRV-DENTAL-GEN", category: "dental", name: "Dental Consultation", patientPrice: 20000, payout: 15000 },
    { id: "SRV-DENTAL-SCALE", category: "dental", name: "Dental Scaling & Polishing", patientPrice: 35000, payout: 26000 },
    { id: "SRV-LAB-CBC", category: "laboratory", name: "Full Blood Count", patientPrice: 5000, payout: 3750 },
    { id: "SRV-LAB-LIPID", category: "laboratory", name: "Lipid Profile", patientPrice: 8000, payout: 6000 },
    { id: "SRV-LAB-FBS", category: "laboratory", name: "Fasting Blood Sugar", patientPrice: 3000, payout: 2200 },
    { id: "SRV-LAB-BP", category: "laboratory", name: "Blood Pressure Check", patientPrice: 1500, payout: 1100 },
    { id: "SRV-HOME-VISIT", category: "home", name: "Home Healthcare Visit", patientPrice: 40000, payout: 30000 },
    { id: "SRV-PREV-WELLNESS", category: "preventive", name: "Wellness Screening Package", patientPrice: 60000, payout: 45000 },
    { id: "SRV-CHRONIC-HTN", category: "chronic", name: "Hypertension Care Programme (Monthly)", patientPrice: 30000, payout: 22000 },
    { id: "SRV-LOGISTICS-STD", category: "logistics", name: "Standard Delivery", patientPrice: 1500, payout: 1200 },
    { id: "SRV-SUB-FAMILY", category: "subscription", name: "Family Health Plan (Monthly)", patientPrice: 25000, payout: 0 },
  ];
  for (const s of services) {
    await db.service.create({
      data: {
        id: s.id,
        category: s.category,
        name: s.name,
        description: s.name,
        active: true,
        prices: {
          create: {
            id: `SP-${s.id}`,
            patientPrice: s.patientPrice,
            providerPayout: s.payout,
            platformMargin: s.patientPrice - s.payout,
            currency: "NGN",
            effectiveFrom: today(-30),
            status: "active",
          },
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // HISTORICAL ENCOUNTER (already completed) — Amina + Dr Tunde
  // -----------------------------------------------------------------------
  const histAppt = await db.appointment.create({
    data: {
      id: "APT-001",
      patientId: "PAT-001",
      providerId: "PRO-001",
      serviceId: "SRV-CONSULT-GP",
      servicePriceId: "SP-SRV-CONSULT-GP",
      date: today(-30),
      time: "10:30",
      durationMinutes: 30,
      consultationChannel: "video",
      price: 15000,
      paymentStatus: "paid",
      status: "completed",
      intakeForm: JSON.stringify({ reason: "Routine blood pressure review", symptoms: "Occasional headaches", consent: true }),
      consentStatus: "granted",
    },
  });

  await db.payment.create({
    data: {
      id: "PAY-001",
      paymentNumber: "RPH-PAY-0001",
      appointmentId: "APT-001",
      patientId: "PAT-001",
      amount: 15000,
      method: "card",
      status: "successful",
      reference: "DEMO-PAY-0001",
    },
  });

  const histEnc = await db.clinicalEncounter.create({
    data: {
      id: "ENC-001",
      encounterNumber: "RPH-ENC-0001",
      appointmentId: "APT-001",
      patientId: "PAT-001",
      providerId: "PRO-001",
      status: "completed",
      locked: true,
      signedAt: nowPlusDays(-30),
      documentation: JSON.stringify({
        consultationReason: "Routine blood pressure review",
        chiefComplaint: "Patient reports occasional early-morning headaches",
        historyPresentIllness: "Known hypertensive, on Amlodipine 10mg daily. Reports intermittent headaches over the past two weeks.",
        relevantMedicalHistory: "Hypertension diagnosed 2023. Migraine history.",
        medicationHistory: "Amlodipine 10mg once daily.",
        allergyConfirmation: "Penicillin (rash), sulphur drugs.",
        vitalSigns: { bp: "138/86", pulse: "78", temp: "36.7", weight: "68kg" },
        examinationFindings: "Cardiovascular system stable, no peripheral oedema.",
        assessment: "Stage 1 hypertension, partially controlled.",
        diagnosis: "Essential hypertension (I10)",
        treatmentPlan: "Continue Amlodipine 10mg. Reinforce lifestyle measures.",
        followUp: "Review in 4 weeks with home BP readings.",
        patientInstructions: "Reduce salt intake, regular moderate exercise, monitor BP at home twice weekly.",
        safetyNetting: "Return immediately if severe headache, chest pain or visual disturbance.",
      }),
    },
  });

  await db.diagnosis.create({
    data: {
      id: "DX-001",
      encounterId: "ENC-001",
      patientId: "PAT-001",
      code: "I10",
      description: "Essential (primary) hypertension",
      type: "primary",
      status: "active",
    },
  });

  // Historical prescription
  const histRx = await db.prescription.create({
    data: {
      id: "RX-001",
      prescriptionNumber: "RPH-RX-0001",
      encounterId: "ENC-001",
      patientId: "PAT-001",
      providerId: "PRO-001",
      status: "fulfilled",
      validityStartDate: today(-30),
      expiryDate: today(60),
      notes: "Continue antihypertensive therapy.",
      doctorNote: "Patient's blood pressure is responding well to Amlodipine 10mg. Continue for 30 days and review with home BP readings. Reinforce salt restriction and daily 30-minute walks. Return if ankle swelling or persistent headaches develop.",
      pharmacyId: "PHA-001",
    },
  });

  await db.prescriptionItem.create({
    data: {
      id: "RXI-001",
      prescriptionId: "RX-001",
      medicine: "Amlodipine",
      genericName: "Amlodipine",
      strength: "10mg",
      dosageForm: "Tablet",
      dose: "1 tablet",
      route: "Oral",
      frequency: "Once daily",
      duration: "30 days",
      quantity: 30,
      refillAllowance: 2,
      substitutionAllowed: true,
      instructions: "Take in the morning with water.",
    },
  });

  // Historical lab request + result
  const histLabReq = await db.laboratoryRequest.create({
    data: {
      id: "LABREQ-001",
      requestNumber: "RPH-LABREQ-0001",
      encounterId: "ENC-001",
      patientId: "PAT-001",
      requestingProviderId: "PRO-001",
      tests: JSON.stringify(["Full Blood Count", "Lipid Profile"]),
      clinicalIndication: "Baseline cardiovascular risk assessment for hypertensive patient.",
      priority: "routine",
      preparationInstructions: "Fast for 10-12 hours before sample collection.",
      fastingRequired: true,
      sampleType: "Venous blood",
      notes: "Annual review panel.",
      status: "completed",
    },
  });

  const histLabBooking = await db.laboratoryBooking.create({
    data: {
      id: "LABBK-001",
      bookingNumber: "RPH-LABBK-0001",
      requestId: "LABREQ-001",
      patientId: "PAT-001",
      laboratoryId: "LAB-001",
      collectionMode: "facility",
      date: today(-25),
      time: "08:00",
      price: 13000,
      paymentStatus: "paid",
      status: "result_published",
    },
  });

  await db.laboratoryResult.create({
    data: {
      id: "LABRES-001",
      resultNumber: "RPH-LABRES-0001",
      requestId: "LABREQ-001",
      bookingId: "LABBK-001",
      patientId: "PAT-001",
      laboratoryId: "LAB-001",
      test: "Lipid Profile",
      sampleCollectionDate: today(-25),
      resultDate: today(-24),
      value: "6.2",
      unit: "mmol/L",
      referenceRange: "< 5.0",
      abnormalIndicator: "high",
      interpretation: "Total cholesterol slightly elevated. Recommend dietary modification and review in 3 months.",
      reviewer: "Dr. Funmi Okafor (Lab Director)",
      status: "published",
    },
  });

  // Historical pharmacy order + delivery (fulfilled)
  const histOrder = await db.pharmacyOrder.create({
    data: {
      id: "ORD-001",
      orderNumber: "RPH-ORD-0001",
      prescriptionId: "RX-001",
      patientId: "PAT-001",
      pharmacyId: "PHA-001",
      deliveryAddress: "24 Alexander Road, Lekki Phase 1, Lagos",
      deliveryFee: 1500,
      subtotal: 6000,
      commissionTotal: 480,
      total: 7500,
      paymentStatus: "paid",
      status: "delivered",
      verificationCode: "RP-7291",
      items: {
        create: {
          id: "ORDI-001",
          productId: "MED-002",
          productName: "Amlodipine 10mg Tablet",
          quantity: 1,
          unitPrice: 6000,
          gross: 6000,
          commissionPct: 8,
          commissionAmount: 480,
          pharmacyNet: 5520,
        },
      },
    },
  });

  await db.delivery.create({
    data: {
      id: "DEL-001",
      deliveryNumber: "RPH-DEL-0001",
      orderId: "ORD-001",
      logisticsProviderId: "LOG-001",
      packageType: "pharmacy",
      pickupLocation: "Grace Community Pharmacy, Lekki",
      pickupContact: "+234 805 222 0101",
      deliveryLocation: "24 Alexander Road, Lekki Phase 1, Lagos",
      recipientName: "Amina Bello",
      handlingInstruction: "Keep dry, away from direct sunlight.",
      verificationCode: "RP-7291",
      payout: 1200,
      status: "delivered",
    },
  });

  // -----------------------------------------------------------------------
  // UPCOMING APPOINTMENT — Amina + Dr Tunde (scheduled, paid)
  // -----------------------------------------------------------------------
  const upcomingAppt = await db.appointment.create({
    data: {
      id: "APT-002",
      patientId: "PAT-001",
      providerId: "PRO-001",
      serviceId: "SRV-CONSULT-GP",
      servicePriceId: "SP-SRV-CONSULT-GP",
      date: today(2),
      time: "11:00",
      durationMinutes: 30,
      consultationChannel: "video",
      price: 15000,
      paymentStatus: "paid",
      status: "scheduled",
      intakeForm: JSON.stringify({
        reason: "Follow-up hypertension review",
        symptoms: "Headaches persisting; wants medication review",
        consent: true,
      }),
      consentStatus: "granted",
    },
  });

  await db.payment.create({
    data: {
      id: "PAY-002",
      paymentNumber: "RPH-PAY-0002",
      appointmentId: "APT-002",
      patientId: "PAT-001",
      amount: 15000,
      method: "card",
      status: "successful",
      reference: "DEMO-PAY-0002",
    },
  });

  // -----------------------------------------------------------------------
  // RECORD ACCESS GRANT — Dr Tunde (active)
  // -----------------------------------------------------------------------
  await db.recordAccessGrant.create({
    data: {
      id: "RAG-001",
      patientId: "PAT-001",
      granteeType: "provider",
      granteeId: "PRO-001",
      granteeName: "Dr. Tunde Adeyemi",
      organisation: "Royal Palace Health Care",
      reason: "Ongoing hypertension management",
      informationShared: JSON.stringify(["Consultations", "Diagnoses", "Laboratory Results", "Prescriptions"]),
      grantedAt: nowPlusDays(-30),
      expiresAt: today(335),
      relatedEncounterId: "ENC-001",
      status: "active",
    },
  });

  await db.consent.create({
    data: {
      id: "CON-001",
      patientId: "PAT-001",
      type: "consultation",
      status: "granted",
      grantedAt: nowPlusDays(-30),
      details: "Consent to share clinical record with consulting provider.",
    },
  });

  // -----------------------------------------------------------------------
  // CARE PLAN
  // -----------------------------------------------------------------------
  await db.carePlan.create({
    data: {
      id: "CP-001",
      patientId: "PAT-001",
      title: "Hypertension Management Plan",
      description: "Ongoing monitoring and lifestyle modification for Stage 1 hypertension.",
      startDate: today(-30),
      endDate: today(335),
      status: "active",
      goals: JSON.stringify([
        "Maintain BP below 130/80",
        "Reduce dietary sodium",
        "150 minutes weekly moderate exercise",
      ]),
    },
  });

  // -----------------------------------------------------------------------
  // NOTIFICATIONS
  // -----------------------------------------------------------------------
  await db.notification.createMany({
    data: [
      { id: "NTF-001", recipientId: "PAT-001", recipientType: "patient", title: "Appointment confirmed", body: "Your video consultation with Dr. Tunde Adeyemi is confirmed.", type: "appointment", relatedId: "APT-002", read: false },
      { id: "NTF-002", recipientId: "PAT-001", recipientType: "patient", title: "Laboratory result available", body: "Your Lipid Profile result is now available in Health Records.", type: "laboratory", relatedId: "LABRES-001", read: false },
      { id: "NTF-003", recipientId: "PAT-001", recipientType: "patient", title: "Order delivered", body: "Your medicine order has been delivered.", type: "pharmacy", relatedId: "ORD-001", read: true },
      { id: "NTF-004", recipientId: "PRO-001", recipientType: "provider", title: "Upcoming appointment", body: "Amina Bello has a follow-up consultation scheduled.", type: "appointment", relatedId: "APT-002", read: false },
      { id: "NTF-005", recipientId: "PRO-001", recipientType: "provider", title: "Laboratory result available", body: "Lipid Profile result for Amina Bello is ready for review.", type: "laboratory", relatedId: "LABRES-001", read: false },
      { id: "NTF-006", recipientId: "PHA-001", recipientType: "pharmacy", title: "Welcome to Royal Palace", body: "Your pharmacy is now live on the platform.", type: "system", read: true },
      { id: "NTF-007", recipientId: "LAB-001", recipientType: "laboratory", title: "Welcome to Royal Palace", body: "Your laboratory is now live on the platform.", type: "system", read: true },
      { id: "NTF-008", recipientId: "LOG-001", recipientType: "logistics", title: "Welcome to Royal Palace", body: "Your logistics account is now live.", type: "system", read: true },
      { id: "NTF-009", recipientId: "ADM-001", recipientType: "admin", title: "New provider application", body: "Dr. Chidi Nwosu submitted an application for review.", type: "system", relatedId: "APP-001", read: false },
    ],
  });

  // -----------------------------------------------------------------------
  // SETTLEMENTS
  // -----------------------------------------------------------------------
  await db.settlement.createMany({
    data: [
      { id: "STL-001", settlementNumber: "RPH-STL-0001", entityType: "provider", entityId: "PRO-001", entityName: "Dr. Tunde Adeyemi", periodStart: today(-30), periodEnd: today(-1), grossAmount: 15000, commissionAmount: 4000, netAmount: 11000, status: "paid" },
      { id: "STL-002", settlementNumber: "RPH-STL-0002", entityType: "pharmacy", entityId: "PHA-001", entityName: "Grace Community Pharmacy", periodStart: today(-30), periodEnd: today(-1), grossAmount: 6000, commissionAmount: 480, netAmount: 5520, status: "paid" },
      { id: "STL-003", settlementNumber: "RPH-STL-0003", entityType: "laboratory", entityId: "LAB-001", entityName: "MedLab Diagnostics", periodStart: today(-30), periodEnd: today(-1), grossAmount: 13000, commissionAmount: 3250, netAmount: 9750, status: "pending" },
      { id: "STL-004", settlementNumber: "RPH-STL-0004", entityType: "logistics", entityId: "LOG-001", entityName: "SwiftCare Logistics", periodStart: today(-30), periodEnd: today(-1), grossAmount: 1500, commissionAmount: 300, netAmount: 1200, status: "paid" },
    ],
  });

  // -----------------------------------------------------------------------
  // AUDIT LOGS
  // -----------------------------------------------------------------------
  await db.auditLog.createMany({
    data: [
      { id: "AUD-001", actorId: "PAT-001", actorRole: "patient", action: "patient_logged_in", entityType: "session", entityId: "PAT-001", description: "Amina Bello logged in." },
      { id: "AUD-002", actorId: "PAT-001", actorRole: "patient", action: "patient_booked_consultation", entityType: "appointment", entityId: "APT-002", description: "Amina Bello booked a consultation with Dr. Tunde Adeyemi." },
      { id: "AUD-003", actorId: "PRO-001", actorRole: "doctor", action: "doctor_completed_consultation", entityType: "encounter", entityId: "ENC-001", description: "Dr. Tunde Adeyemi completed a consultation." },
      { id: "AUD-004", actorId: "PRO-001", actorRole: "doctor", action: "doctor_issued_prescription", entityType: "prescription", entityId: "RX-001", description: "Dr. Tunde Adeyemi issued a prescription." },
      { id: "AUD-005", actorId: "LAB-001", actorRole: "laboratory", action: "laboratory_published_result", entityType: "laboratory_result", entityId: "LABRES-001", description: "MedLab Diagnostics published a laboratory result." },
      { id: "AUD-006", actorId: "ADM-001", actorRole: "admin", action: "admin_approved_provider", entityType: "provider", entityId: "PRO-001", description: "Dr. Tunde Adeyemi was approved." },
    ],
  });

  // -----------------------------------------------------------------------
  // COMPLAINT
  // -----------------------------------------------------------------------
  await db.complaint.create({
    data: {
      id: "CMP-001",
      complainantId: "PAT-001",
      complainantType: "patient",
      subject: "Delayed laboratory result",
      description: "Result took an extra day to appear in records.",
      status: "resolved",
      priority: "normal",
    },
  });

  // -----------------------------------------------------------------------
  // MANAGER MODULE STORY (plan §7)
  // Deterministic demo: manager@demo.com / demo123 -> MGR-001 Oluwagbenga
  // Kosoko (MGR-00128, code MGR00128). A second manager (MGR-002, pending
  // verification) owns a reassigned pharmacy so reassignment history and
  // multi-manager rules are visible.
  // -----------------------------------------------------------------------

  // -- manager users ------------------------------------------------------
  await db.user.createMany({
    data: [
      {
        id: "USR-MGR-001",
        email: "manager@demo.com",
        password: "demo123",
        role: "manager",
        status: "active",
        profileId: "MGR-001",
        name: "Oluwagbenga Kosoko",
      },
      { id: "USR-SUPPORT-001", email: "support@demo.com", password: "demo123", role: "support", status: "active", name: "Royal Palace Support" },
      {
        id: "USR-MGR-002",
        email: "manager2@demo.com",
        password: "demo123",
        role: "manager",
        status: "active",
        profileId: "MGR-002",
        name: "Adaeze Umeh",
      },
      // Users for the organizations created by the manager story below.
      { id: "USR-PHA-002", email: "sunrise@demo.com", password: "demo123", role: "pharmacy", status: "active", profileId: "PHA-002", name: "Sunrise Pharmacy" },
      { id: "USR-PHA-003", email: "wellness@demo.com", password: "demo123", role: "pharmacy", status: "active", profileId: "PHA-003", name: "WellnessPlus Pharmacy" },
      { id: "USR-LAB-002", email: "ikejacentral@demo.com", password: "demo123", role: "laboratory", status: "active", profileId: "LAB-002", name: "Ikeja Central Laboratory" },
      { id: "USR-HOS-001", email: "lagoonhospital@demo.com", password: "demo123", role: "hospital", status: "active", profileId: "HOS-001", name: "Lagoon Specialist Hospital" },
    ],
  });

  await db.manager.createMany({
    data: [
      {
        id: "MGR-001",
        userId: "USR-MGR-001",
        managerNumber: "MGR-00128",
        onboardingCode: "MGR00128",
        firstName: "Oluwagbenga",
        lastName: "Kosoko",
        email: "manager@demo.com",
        phone: "+234 803 555 0128",
        city: "Lagos",
        state: "Lagos",
        territory: "Lagos Mainland",
        employmentStatus: "full_time",
        verificationStatus: "verified",
        joinedAt: nowPlusDays(-210),
      },
      {
        id: "MGR-002",
        userId: "USR-MGR-002",
        managerNumber: "MGR-00129",
        onboardingCode: "MGR00129",
        firstName: "Adaeze",
        lastName: "Umeh",
        email: "manager2@demo.com",
        phone: "+234 805 555 0129",
        city: "Lagos",
        state: "Lagos",
        territory: "Lagos Island",
        employmentStatus: "contract",
        verificationStatus: "pending",
        joinedAt: nowPlusDays(-60),
      },
    ],
  });

  // -- additional portfolio organizations ---------------------------------
  await db.pharmacy.createMany({
    data: [
      {
        id: "PHA-002", userId: "USR-PHA-002", pharmacyNumber: "RPH-PHA-0002",
        name: "Sunrise Pharmacy", city: "Lagos", state: "Lagos",
        address: "12 Awolowo Road, Ikoyi", phone: "+234 802 222 0022", email: "care@sunriserx.ng",
        verificationStatus: "approved", rating: 4.2,
      },
      {
        id: "PHA-003", userId: "USR-PHA-003", pharmacyNumber: "RPH-PHA-0003",
        name: "WellnessPlus Pharmacy", city: "Ibadan", state: "Oyo",
        address: "5 Ring Road, Ibadan", phone: "+234 809 333 0033", email: "hello@wellnessplus.ng",
        verificationStatus: "approved", rating: 4.6,
      },
    ],
  });
  await db.laboratory.create({
    data: {
      id: "LAB-002", userId: "USR-LAB-002", laboratoryNumber: "RPH-LAB-0002",
      name: "Ikeja Central Laboratory", city: "Lagos", state: "Lagos",
      address: "88 Allen Avenue, Ikeja", phone: "+234 807 444 0044", email: "info@ikejacentral.ng",
      verificationStatus: "approved", rating: 4.4,
    },
  });
  await db.hospital.create({
    data: {
      id: "HOS-001", userId: "USR-HOS-001", hospitalNumber: "RPH-HOS-0001", name: "Lagoon Specialist Hospital",
      description: "Multi-specialty hospital with emergency and diagnostic care.", city: "Lagos", state: "Lagos",
      address: "8 Marine Road, Victoria Island", phone: "+234 809 555 0101", email: "care@lagoonhospital.ng",
      emergencyAvailable: true, openTwentyFourHours: true, verificationStatus: "approved", rating: 4.7,
      acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-25),
      services: { create: [
        { id: "HOS-SVC-001", name: "Emergency Care", category: "Emergency" },
        { id: "HOS-SVC-002", name: "Cardiology", category: "Specialist Care" },
        { id: "HOS-SVC-003", name: "Maternity", category: "Women and Children" },
        { id: "HOS-SVC-004", name: "Diagnostic Imaging", category: "Diagnostics" },
      ] },
    },
  });

  await db.patient.update({
    where: { id: "PAT-001" },
    data: { acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-180), onboardingStatus: "approved" },
  });

  // -- attribution: acquired-by vs currently-managed-by (plan §1) ----------
  await db.pharmacy.update({
    where: { id: "PHA-001" },
    data: { acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-200), currentManagerId: "MGR-001", managerAssignedAt: nowPlusDays(-200), managerRelationshipStatus: "active" },
  });
  await db.laboratory.update({
    where: { id: "LAB-001" },
    data: { acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-190), currentManagerId: "MGR-001", managerAssignedAt: nowPlusDays(-190), managerRelationshipStatus: "active" },
  });
  // Sunrise was acquired by MGR-001 and later reassigned to MGR-002.
  await db.pharmacy.update({
    where: { id: "PHA-002" },
    data: { acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-120), currentManagerId: "MGR-002", managerAssignedAt: nowPlusDays(-30), managerRelationshipStatus: "active" },
  });
  // WellnessPlus registered independently — admin assigned it to MGR-001
  // (acquiredBy stays null: assignment without acquisition, plan §3.4).
  await db.pharmacy.update({
    where: { id: "PHA-003" },
    data: { currentManagerId: "MGR-001", managerAssignedAt: nowPlusDays(-45), managerRelationshipStatus: "active" },
  });
  await db.laboratory.update({
    where: { id: "LAB-002" },
    data: { acquiredByManagerId: "MGR-001", acquiredAt: nowPlusDays(-40), currentManagerId: "MGR-001", managerAssignedAt: nowPlusDays(-40), managerRelationshipStatus: "active" },
  });

  // -- assignment history (reassignment keeps prior rows, plan §4) ---------
  await db.managerAssignment.createMany({
    data: [
      { id: "MAS-001", managerId: "MGR-001", organizationType: "pharmacy", pharmacyId: "PHA-001", source: "acquisition", relationshipStatus: "active", startsAt: nowPlusDays(-200), assignedBy: "ADM-001", reason: "Onboarded via acquisition." },
      { id: "MAS-002", managerId: "MGR-001", organizationType: "laboratory", laboratoryId: "LAB-001", source: "acquisition", relationshipStatus: "active", startsAt: nowPlusDays(-190), assignedBy: "ADM-001", reason: "Onboarded via acquisition." },
      { id: "MAS-003", managerId: "MGR-001", organizationType: "pharmacy", pharmacyId: "PHA-002", source: "acquisition", relationshipStatus: "ended", startsAt: nowPlusDays(-120), endsAt: nowPlusDays(-30), assignedBy: "ADM-001", reason: "Initial assignment after acquisition." },
      { id: "MAS-004", managerId: "MGR-002", organizationType: "pharmacy", pharmacyId: "PHA-002", source: "reassignment", relationshipStatus: "active", startsAt: nowPlusDays(-30), assignedBy: "ADM-001", reason: "Territory realignment — Sunrise moved to Lagos Island manager." },
      { id: "MAS-005", managerId: "MGR-001", organizationType: "pharmacy", pharmacyId: "PHA-003", source: "admin_assignment", relationshipStatus: "active", startsAt: nowPlusDays(-45), assignedBy: "ADM-001", reason: "Independent registration assigned for portfolio coverage." },
      { id: "MAS-006", managerId: "MGR-001", organizationType: "laboratory", laboratoryId: "LAB-002", source: "application_approval", relationshipStatus: "active", startsAt: nowPlusDays(-40), assignedBy: "ADM-001", reason: "Approved organization application MOA-006." },
    ],
  });

  // -- revenue share rules (basis points, effective-dated, plan §4) --------
  await db.managerRevenueShareRule.createMany({
    data: [
      { id: "MRR-001", managerId: "MGR-001", organizationType: "pharmacy", transactionType: "subscription", rateBps: 300, effectiveFrom: nowPlusDays(-200), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-002", managerId: "MGR-001", organizationType: "laboratory", transactionType: "subscription", rateBps: 250, effectiveFrom: nowPlusDays(-190), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-003", managerId: "MGR-001", organizationType: "pharmacy", transactionType: "platform_fee", rateBps: 500, effectiveFrom: nowPlusDays(-200), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-004", managerId: "MGR-001", organizationType: "laboratory", transactionType: "platform_fee", rateBps: 400, effectiveFrom: nowPlusDays(-190), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-005", managerId: "MGR-002", organizationType: "pharmacy", transactionType: "platform_fee", rateBps: 500, effectiveFrom: nowPlusDays(-30), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-006", managerId: "MGR-001", organizationType: "consultation", transactionType: "patient_payment", activityType: "consultation", rateBps: 500, effectiveFrom: nowPlusDays(-180), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-007", managerId: "MGR-001", organizationType: "pharmacy", transactionType: "patient_payment", activityType: "pharmacy", rateBps: 300, effectiveFrom: nowPlusDays(-180), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-008", managerId: "MGR-001", organizationType: "laboratory", transactionType: "patient_payment", activityType: "laboratory", rateBps: 400, effectiveFrom: nowPlusDays(-180), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
      { id: "MRR-009", managerId: "MGR-001", organizationType: "hospital", transactionType: "patient_payment", activityType: "hospital", rateBps: 450, effectiveFrom: nowPlusDays(-180), status: "active", createdBy: "ADM-001", approvedBy: "ADM-001" },
    ],
  });

  // -- organization payments (platform fees only, never patient money) -----
  await db.organizationPayment.createMany({
    data: [
      { id: "ORGP-001", paymentNumber: "ORGP-1001", organizationType: "pharmacy", pharmacyId: "PHA-001", transactionType: "subscription", amount: 120000, status: "successful", reference: "ref-grace-sub-150", paidAt: nowPlusDays(-150) },
      { id: "ORGP-002", paymentNumber: "ORGP-1002", organizationType: "laboratory", laboratoryId: "LAB-001", transactionType: "subscription", amount: 150000, status: "successful", reference: "ref-medlab-sub-140", paidAt: nowPlusDays(-140) },
      { id: "ORGP-003", paymentNumber: "ORGP-1003", organizationType: "pharmacy", pharmacyId: "PHA-001", transactionType: "platform_fee", amount: 80000, status: "successful", reference: "ref-grace-pf-45", paidAt: nowPlusDays(-45) },
      { id: "ORGP-004", paymentNumber: "ORGP-1004", organizationType: "pharmacy", pharmacyId: "PHA-001", transactionType: "subscription", amount: 96000, status: "successful", reference: "ref-grace-sub-30", paidAt: nowPlusDays(-30) },
      { id: "ORGP-005", paymentNumber: "ORGP-1005", organizationType: "laboratory", laboratoryId: "LAB-001", transactionType: "platform_fee", amount: 60000, status: "successful", reference: "ref-medlab-pf-25", paidAt: nowPlusDays(-25) },
      { id: "ORGP-006", paymentNumber: "ORGP-1006", organizationType: "pharmacy", pharmacyId: "PHA-003", transactionType: "subscription", amount: 100000, status: "successful", reference: "ref-wellness-sub-20", paidAt: nowPlusDays(-20) },
      { id: "ORGP-007", paymentNumber: "ORGP-1007", organizationType: "laboratory", laboratoryId: "LAB-002", transactionType: "subscription", amount: 90000, status: "successful", reference: "ref-ikeja-sub-3", paidAt: nowPlusDays(-3) },
      { id: "ORGP-008", paymentNumber: "ORGP-1008", organizationType: "pharmacy", pharmacyId: "PHA-002", transactionType: "platform_fee", amount: 70000, status: "successful", reference: "ref-sunrise-pf-12", paidAt: nowPlusDays(-12) },
      { id: "ORGP-009", paymentNumber: "ORGP-1009", organizationType: "pharmacy", pharmacyId: "PHA-001", transactionType: "subscription", amount: 120000, status: "refunded", reference: "ref-grace-sub-60", paidAt: nowPlusDays(-60), refundedAt: nowPlusDays(-50), refundAmount: 120000 },
      { id: "ORGP-010", paymentNumber: "ORGP-1010", organizationType: "laboratory", laboratoryId: "LAB-001", transactionType: "subscription", amount: 150000, status: "successful", reference: "ref-medlab-sub-5", paidAt: nowPlusDays(-5) },
      { id: "ORGP-011", paymentNumber: "ORGP-1011", organizationType: "pharmacy", pharmacyId: "PHA-003", transactionType: "renewal", amount: 100000, status: "pending", reference: "ref-wellness-ren-1" },
      { id: "ORGP-012", paymentNumber: "ORGP-1012", organizationType: "pharmacy", pharmacyId: "PHA-002", transactionType: "subscription", amount: 80000, status: "successful", reference: "ref-sunrise-sub-70", paidAt: nowPlusDays(-70) },
      { id: "ORGP-013", paymentNumber: "ORGP-1013", organizationType: "laboratory", laboratoryId: "LAB-002", transactionType: "platform_fee", amount: 50000, status: "failed", reference: "ref-ikeja-pf-8" },
      { id: "ORGP-014", paymentNumber: "ORGP-1014", organizationType: "pharmacy", pharmacyId: "PHA-001", transactionType: "service_fee", amount: 40000, status: "successful", reference: "ref-grace-sf-10", paidAt: nowPlusDays(-10) },
    ],
  });

  // -- manager payouts ------------------------------------------------------
  await db.payoutRequest.createMany({
    data: [
      {
        id: "MGP-001", payoutNumber: "RPH-PAYR-M001", entityType: "manager", entityId: "MGR-001", managerId: "MGR-001",
        entityName: "Oluwagbenga Kosoko", amountRequested: 5280, periodStart: today(-30), periodEnd: today(-1),
        status: "requested", method: "bank_transfer", notes: "Monthly earnings withdrawal.", requestedAt: nowPlusDays(-2),
      },
      {
        id: "MGP-002", payoutNumber: "RPH-PAYR-M002", entityType: "manager", entityId: "MGR-001", managerId: "MGR-001",
        entityName: "Oluwagbenga Kosoko", amountRequested: 9750, periodStart: today(-60), periodEnd: today(-31),
        status: "paid", method: "bank_transfer", requestedAt: nowPlusDays(-20), processedAt: nowPlusDays(-15), processedBy: "ADM-001",
        adminNote: "Paid to GTBank ****4821.",
      },
    ],
  });

  // -- earnings ledger (immutable entries + refund reversal) ---------------
  // Amounts are round(eligible * rateBps / 10000); MGE-00012 credits MGR-001
  // because that payment happened while Sunrise was still MGR-001's (history).
  await db.managerEarning.createMany({
    data: [
      { id: "MGE-00001", earningNumber: "MGE-00001", eventKey: "orgpay:ORGP-001:earning", managerId: "MGR-001", managerAssignmentId: "MAS-001", organizationPaymentId: "ORGP-001", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1001", eligibleAmount: 120000, rateBps: 300, amount: 3600, entryType: "earning", status: "paid", occurredAt: nowPlusDays(-150), availableAt: nowPlusDays(-143), payoutRequestId: "MGP-002" },
      { id: "MGE-00002", earningNumber: "MGE-00002", eventKey: "orgpay:ORGP-002:earning", managerId: "MGR-001", managerAssignmentId: "MAS-002", organizationPaymentId: "ORGP-002", organizationType: "laboratory", organizationId: "LAB-001", organizationName: "MedLab Diagnostics", paymentType: "subscription", paymentNumber: "ORGP-1002", eligibleAmount: 150000, rateBps: 250, amount: 3750, entryType: "earning", status: "paid", occurredAt: nowPlusDays(-140), availableAt: nowPlusDays(-133), payoutRequestId: "MGP-002" },
      { id: "MGE-00003", earningNumber: "MGE-00003", eventKey: "orgpay:ORGP-003:earning", managerId: "MGR-001", managerAssignmentId: "MAS-001", organizationPaymentId: "ORGP-003", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy", paymentType: "platform_fee", paymentNumber: "ORGP-1003", eligibleAmount: 80000, rateBps: 500, amount: 4000, entryType: "earning", status: "available", occurredAt: nowPlusDays(-45), availableAt: nowPlusDays(-38) },
      { id: "MGE-00004", earningNumber: "MGE-00004", eventKey: "orgpay:ORGP-004:earning", managerId: "MGR-001", managerAssignmentId: "MAS-001", organizationPaymentId: "ORGP-004", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1004", eligibleAmount: 96000, rateBps: 300, amount: 2880, entryType: "earning", status: "available", occurredAt: nowPlusDays(-30), availableAt: nowPlusDays(-23), payoutRequestId: "MGP-001" },
      { id: "MGE-00005", earningNumber: "MGE-00005", eventKey: "orgpay:ORGP-005:earning", managerId: "MGR-001", managerAssignmentId: "MAS-002", organizationPaymentId: "ORGP-005", organizationType: "laboratory", organizationId: "LAB-001", organizationName: "MedLab Diagnostics", paymentType: "platform_fee", paymentNumber: "ORGP-1005", eligibleAmount: 60000, rateBps: 400, amount: 2400, entryType: "earning", status: "available", occurredAt: nowPlusDays(-25), availableAt: nowPlusDays(-18), payoutRequestId: "MGP-001" },
      { id: "MGE-00006", earningNumber: "MGE-00006", eventKey: "orgpay:ORGP-006:earning", managerId: "MGR-001", managerAssignmentId: "MAS-005", organizationPaymentId: "ORGP-006", organizationType: "pharmacy", organizationId: "PHA-003", organizationName: "WellnessPlus Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1006", eligibleAmount: 100000, rateBps: 300, amount: 3000, entryType: "earning", status: "available", occurredAt: nowPlusDays(-20), availableAt: nowPlusDays(-13) },
      { id: "MGE-00007", earningNumber: "MGE-00007", eventKey: "orgpay:ORGP-007:earning", managerId: "MGR-001", managerAssignmentId: "MAS-006", organizationPaymentId: "ORGP-007", organizationType: "laboratory", organizationId: "LAB-002", organizationName: "Ikeja Central Laboratory", paymentType: "subscription", paymentNumber: "ORGP-1007", eligibleAmount: 90000, rateBps: 250, amount: 2250, entryType: "earning", status: "pending", occurredAt: nowPlusDays(-3) },
      { id: "MGE-00008", earningNumber: "MGE-00008", eventKey: "orgpay:ORGP-008:earning", managerId: "MGR-002", managerAssignmentId: "MAS-004", organizationPaymentId: "ORGP-008", organizationType: "pharmacy", organizationId: "PHA-002", organizationName: "Sunrise Pharmacy", paymentType: "platform_fee", paymentNumber: "ORGP-1008", eligibleAmount: 70000, rateBps: 500, amount: 3500, entryType: "earning", status: "available", occurredAt: nowPlusDays(-12), availableAt: nowPlusDays(-5) },
      { id: "MGE-00009", earningNumber: "MGE-00009", eventKey: "orgpay:ORGP-009:earning", managerId: "MGR-001", managerAssignmentId: "MAS-001", organizationPaymentId: "ORGP-009", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1009", eligibleAmount: 120000, rateBps: 300, amount: 3600, entryType: "earning", status: "reversed", occurredAt: nowPlusDays(-60), availableAt: nowPlusDays(-53) },
      { id: "MGE-00010", earningNumber: "MGE-00010", eventKey: "orgpay:ORGP-009:reversal:1", managerId: "MGR-001", managerAssignmentId: "MAS-001", organizationPaymentId: "ORGP-009", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1009", eligibleAmount: -120000, rateBps: 300, amount: -3600, entryType: "reversal", status: "reversed", occurredAt: nowPlusDays(-50), reversalOfId: "MGE-00009" },
      { id: "MGE-00011", earningNumber: "MGE-00011", eventKey: "orgpay:ORGP-010:earning", managerId: "MGR-001", managerAssignmentId: "MAS-002", organizationPaymentId: "ORGP-010", organizationType: "laboratory", organizationId: "LAB-001", organizationName: "MedLab Diagnostics", paymentType: "subscription", paymentNumber: "ORGP-1010", eligibleAmount: 150000, rateBps: 250, amount: 3750, entryType: "earning", status: "pending", occurredAt: nowPlusDays(-5) },
      { id: "MGE-00012", earningNumber: "MGE-00012", eventKey: "orgpay:ORGP-012:earning", managerId: "MGR-001", managerAssignmentId: "MAS-003", organizationPaymentId: "ORGP-012", organizationType: "pharmacy", organizationId: "PHA-002", organizationName: "Sunrise Pharmacy", paymentType: "subscription", paymentNumber: "ORGP-1012", eligibleAmount: 80000, rateBps: 300, amount: 2400, entryType: "earning", status: "paid", occurredAt: nowPlusDays(-70), availableAt: nowPlusDays(-63), payoutRequestId: "MGP-002" },
    ],
  });

  // Patient-attributed activity: the Manager ledger exposes only the earning
  // rows, while gross activity amounts remain restricted to Admin.
  await db.patientActivityPayment.createMany({ data: [
    { id: "PAP-001", paymentNumber: "RPH-PAP-0001", patientId: "PAT-001", activityType: "consultation", sourceId: "APT-001", amount: 25000, reference: "demo-patient-consultation", occurredAt: nowPlusDays(-2) },
    { id: "PAP-002", paymentNumber: "RPH-PAP-0002", patientId: "PAT-001", activityType: "laboratory", sourceId: "LBK-001", amount: 18000, reference: "demo-patient-laboratory", occurredAt: nowPlusDays(-1) },
  ] });
  await db.managerEarning.createMany({ data: [
    { id: "MGE-PAT-001", earningNumber: "RPH-ME-0001", eventKey: "patient-activity:PAP-001", managerId: "MGR-001", patientActivityPaymentId: "PAP-001", organizationType: "consultation", organizationId: "APT-001", organizationName: "Patient activity", paymentType: "patient_payment", paymentNumber: "RPH-PAP-0001", eligibleAmount: 25000, rateBps: 500, amount: 1250, entryType: "earning", status: "available", occurredAt: nowPlusDays(-2), availableAt: nowPlusDays(-2) },
    { id: "MGE-PAT-002", earningNumber: "RPH-ME-0002", eventKey: "patient-activity:PAP-002", managerId: "MGR-001", patientActivityPaymentId: "PAP-002", organizationType: "laboratory", organizationId: "LBK-001", organizationName: "Patient activity", paymentType: "patient_payment", paymentNumber: "RPH-PAP-0002", eligibleAmount: 18000, rateBps: 400, amount: 720, entryType: "earning", status: "available", occurredAt: nowPlusDays(-1), availableAt: nowPlusDays(-1) },
  ] });

  // -- organization applications across every status (plan §3.4) -----------
  await db.managerOrganizationApplication.createMany({
    data: [
      { id: "MOA-001", applicationNumber: "MOA-1001", managerId: "MGR-001", organizationType: "pharmacy", businessName: "Beyond Drugs Pharmacy", contactPerson: "Ngozi Okafor", contactEmail: "ngozi@beyonddrugs.ng", contactPhone: "+234 801 111 0001", address: "3 Herbert Macaulay Way", city: "Lagos", state: "Lagos", registrationNumber: "RC-771001", status: "submitted", submittedAt: nowPlusDays(-4) },
      { id: "MOA-002", applicationNumber: "MOA-1002", managerId: "MGR-001", organizationType: "laboratory", businessName: "Yaba Diagnostic Centre", contactPerson: "Tunde Balogun", contactEmail: "tunde@yabadx.ng", contactPhone: "+234 801 111 0002", address: "21 Yaba Road", city: "Lagos", state: "Lagos", registrationNumber: "RC-771002", licenceNumber: "LAB-LIC-4482", status: "under_review", submittedAt: nowPlusDays(-9) },
      { id: "MOA-003", applicationNumber: "MOA-1003", managerId: "MGR-001", organizationType: "pharmacy", businessName: "Surulere Chemist Plus", contactPerson: "Bisi Adewale", contactEmail: "bisi@surucheplus.ng", contactPhone: "+234 801 111 0003", address: "9 Bode Thomas Street", city: "Lagos", state: "Lagos", registrationNumber: "RC-771003", status: "information_required", submittedAt: nowPlusDays(-16), reviewedAt: nowPlusDays(-12), reviewerId: "ADM-001", reviewerNote: "Licence photo is unreadable — please re-upload." },
      { id: "MOA-004", applicationNumber: "MOA-1004", managerId: "MGR-001", organizationType: "laboratory", businessName: "Abeokuta Med Tests", contactPerson: "Femi Ogun", contactEmail: "femi@abkmedtests.ng", contactPhone: "+234 801 111 0004", address: "14 Kuto Road", city: "Abeokuta", state: "Ogun", registrationNumber: "RC-771004", status: "rejected", submittedAt: nowPlusDays(-35), reviewedAt: nowPlusDays(-30), reviewerId: "ADM-001", reviewerNote: "Outside active coverage territory for now." },
      { id: "MOA-005", applicationNumber: "MOA-1005", managerId: "MGR-001", organizationType: "pharmacy", businessName: "Grace Community Pharmacy", contactPerson: "Grace Ade", contactEmail: "grace@gracecommunity.ng", contactPhone: "+234 801 111 0005", address: "27 Allen Avenue", city: "Lagos", state: "Lagos", registrationNumber: "RC-771005", licenceNumber: "PH-LIC-1023", status: "approved", submittedAt: nowPlusDays(-205), reviewedAt: nowPlusDays(-201), reviewerId: "ADM-001", reviewerNote: "Approved and onboarded.", createdPharmacyId: "PHA-001" },
      { id: "MOA-006", applicationNumber: "MOA-1006", managerId: "MGR-001", organizationType: "laboratory", businessName: "Ikeja Central Laboratory", contactPerson: "Chika Eze", contactEmail: "chika@ikejacentral.ng", contactPhone: "+234 801 111 0006", address: "88 Allen Avenue", city: "Lagos", state: "Lagos", registrationNumber: "RC-771006", licenceNumber: "LAB-LIC-2210", status: "approved", submittedAt: nowPlusDays(-44), reviewedAt: nowPlusDays(-41), reviewerId: "ADM-001", reviewerNote: "Approved and onboarded.", createdLaboratoryId: "LAB-002" },
      { id: "MOA-007", applicationNumber: "MOA-1007", managerId: "MGR-002", organizationType: "pharmacy", businessName: "Victoria Island Rx", contactPerson: "Lanre Shonibare", contactEmail: "lanre@virx.ng", contactPhone: "+234 801 111 0007", address: "4 Adeola Odeku", city: "Lagos", state: "Lagos", registrationNumber: "RC-771007", status: "submitted", submittedAt: nowPlusDays(-2) },
      { id: "MOA-008", applicationNumber: "MOA-1008", managerId: "MGR-001", organizationType: "pharmacy", businessName: "Gbagada HealthMart", contactPerson: "Uche Nwosu", contactEmail: "uche@healthmart.ng", contactPhone: "+234 801 111 0008", address: "7 Diya Street", city: "Lagos", state: "Lagos", registrationNumber: "RC-771008", status: "draft", submittedAt: null },
      { id: "MOA-009", applicationNumber: "MOA-1009", managerId: "MGR-001", organizationType: "hospital", businessName: "Lagoon Specialist Hospital", contactPerson: "Dr. Lara Bello", contactEmail: "care@lagoonhospital.ng", contactPhone: "+234 809 555 0101", address: "8 Marine Road, Victoria Island", city: "Lagos", state: "Lagos", registrationNumber: "RC-771009", services: "[\"Emergency Care\",\"Cardiology\",\"Maternity\",\"Diagnostic Imaging\"]", status: "approved", submittedAt: nowPlusDays(-30), reviewedAt: nowPlusDays(-25), reviewerId: "ADM-001", createdHospitalId: "HOS-001" },
    ],
  });
  await db.managerPatientApplication.create({ data: { id: "MPA-001", applicationNumber: "MPA-1001", managerId: "MGR-001", patientId: "PAT-001", status: "approved", submittedAt: nowPlusDays(-182), reviewedAt: nowPlusDays(-180), reviewerId: "ADM-001", reviewerNote: "Identity verified." } });

  // -- support tickets across the routing flow (plan §3.7) ------------------
  await db.supportTicket.createMany({
    data: [
      {
        id: "TKT-001", ticketNumber: "TKT-1001", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy",
        managerId: "MGR-001", creatorId: "PHA-001", creatorName: "Grace Community Pharmacy", subject: "Settlement not received for last cycle", category: "payments",
        priority: "high", status: "escalated_to_royal_palace", escalationDepartment: "Finance", escalationReason: "Bank response pending beyond SLA — needs Finance.",
        escalatedAt: nowPlusDays(-6), lastActivityAt: nowPlusDays(-6),
      },
      {
        id: "TKT-002", ticketNumber: "TKT-1002", organizationType: "laboratory", organizationId: "LAB-001", organizationName: "MedLab Diagnostics",
        managerId: "MGR-001", creatorId: "LAB-001", creatorName: "MedLab Diagnostics", subject: "Cannot update opening hours", category: "account",
        priority: "medium", status: "manager_investigating", lastActivityAt: nowPlusDays(-2),
      },
      {
        id: "TKT-003", ticketNumber: "TKT-1003", organizationType: "pharmacy", organizationId: "PHA-003", organizationName: "WellnessPlus Pharmacy",
        managerId: "MGR-001", creatorId: "PHA-003", creatorName: "WellnessPlus Pharmacy", subject: "Subscription invoice shows wrong amount", category: "billing",
        priority: "medium", status: "waiting_for_organization", lastActivityAt: nowPlusDays(-4),
      },
      {
        id: "TKT-004", ticketNumber: "TKT-1004", organizationType: "pharmacy", organizationId: "PHA-001", organizationName: "Grace Community Pharmacy",
        managerId: "MGR-001", creatorId: "PHA-001", creatorName: "Grace Community Pharmacy", subject: "Staff account locked out", category: "account",
        priority: "low", status: "resolved", resolution: "Password reset link issued and confirmed working.", resolvedAt: nowPlusDays(-18), lastActivityAt: nowPlusDays(-18),
      },
      {
        id: "TKT-005", ticketNumber: "TKT-1005", organizationType: "laboratory", organizationId: "LAB-002", organizationName: "Ikeja Central Laboratory",
        managerId: "MGR-001", creatorId: "LAB-002", creatorName: "Ikeja Central Laboratory", subject: "Onboarding checklist question", category: "onboarding",
        priority: "low", status: "assigned_to_manager", lastActivityAt: nowPlusDays(-1),
      },
    ],
  });
  await db.supportTicketMessage.createMany({
    data: [
      { id: "TKM-001", ticketId: "TKT-001", actorId: "PHA-001", actorRole: "pharmacy", actorName: "Grace Community Pharmacy", body: "Our settlement for last cycle has not arrived.", visibility: "shared" },
      { id: "TKM-002", ticketId: "TKT-001", actorId: "MGR-001", actorRole: "manager", actorName: "Oluwagbenga Kosoko", body: "Investigating with the finance team — bank confirmation is taking longer than the SLA.", visibility: "shared" },
      { id: "TKM-003", ticketId: "TKT-001", actorId: "MGR-001", actorRole: "manager", actorName: "Oluwagbenga Kosoko", body: "Internal: bank replied with a no-match on account name. Escalating to Finance.", visibility: "manager_internal" },
      { id: "TKM-004", ticketId: "TKT-001", actorId: "ADM-001", actorRole: "admin", actorName: "Royal Palace Admin", body: "Finance engaged. Reference sent to the disbursement bank.", visibility: "admin_internal" },
      { id: "TKM-005", ticketId: "TKT-002", actorId: "LAB-001", actorRole: "laboratory", actorName: "MedLab Diagnostics", body: "The opening hours field will not save.", visibility: "shared" },
      { id: "TKM-006", ticketId: "TKT-002", actorId: "MGR-001", actorRole: "manager", actorName: "Oluwagbenga Kosoko", body: "Trying a clean session — will confirm shortly.", visibility: "shared" },
      { id: "TKM-007", ticketId: "TKT-003", actorId: "PHA-003", actorRole: "pharmacy", actorName: "WellnessPlus Pharmacy", body: "Invoice amount differs from our plan price.", visibility: "shared" },
      { id: "TKM-008", ticketId: "TKT-003", actorId: "MGR-001", actorRole: "manager", actorName: "Oluwagbenga Kosoko", body: "Could you share the invoice PDF so I can verify the plan?", visibility: "shared" },
      { id: "TKM-009", ticketId: "TKT-004", actorId: "PHA-001", actorRole: "pharmacy", actorName: "Grace Community Pharmacy", body: "A staff member cannot log in.", visibility: "shared" },
      { id: "TKM-010", ticketId: "TKT-004", actorId: "MGR-001", actorRole: "manager", actorName: "Oluwagbenga Kosoko", body: "Issued a password reset — resolved.", visibility: "shared" },
      { id: "TKM-011", ticketId: "TKT-005", actorId: "LAB-002", actorRole: "laboratory", actorName: "Ikeja Central Laboratory", body: "Which checks happen before our listing goes live?", visibility: "shared" },
    ],
  });

  // -- payout bank details (API returns masked account numbers only) --------
  await db.managerBankAccount.create({
    data: {
      id: "MBA-001", managerId: "MGR-001", bankName: "GTBank", bankCode: "058",
      accountName: "Oluwagbenga Kosoko", accountNumber: "0123456789",
      verificationStatus: "verified", verifiedAt: nowPlusDays(-100),
    },
  });

  // -- notifications + audit for the manager story --------------------------
  await db.notification.createMany({
    data: [
      { id: "NTF-M01", recipientId: "MGR-001", recipientType: "manager", title: "New Manager Earning", body: "Grace Community Pharmacy subscription payment generated ₦2,880.", type: "manager", relatedId: "MGE-00004", read: false },
      { id: "NTF-M02", recipientId: "MGR-001", recipientType: "manager", title: "Payout Requested", body: "Payout RPH-PAYR-M001 for ₦5,280 is awaiting admin review.", type: "manager", relatedId: "MGP-001", read: false },
      { id: "NTF-M03", recipientId: "MGR-001", recipientType: "manager", title: "Payout Paid", body: "Payout RPH-PAYR-M002 for ₦9,750 has been paid.", type: "manager", relatedId: "MGP-002", read: true },
      { id: "NTF-M04", recipientId: "MGR-001", recipientType: "manager", title: "Ticket Escalated", body: "TKT-1001 (Grace Community Pharmacy) was escalated to Finance.", type: "manager", relatedId: "TKT-001", read: false },
      { id: "NTF-M05", recipientId: "MGR-001", recipientType: "manager", title: "Application Under Review", body: "MOA-1002 (Yaba Diagnostic Centre) moved to under review.", type: "manager", relatedId: "MOA-002", read: true },
      { id: "NTF-M06", recipientId: "ADM-001", recipientType: "admin", title: "Manager Payout Request", body: "Oluwagbenga Kosoko requested a payout of ₦5,280.", type: "system", relatedId: "MGP-001", read: false },
    ],
  });
  await db.auditLog.createMany({
    data: [
      { id: "AUD-M01", actorId: "MGR-001", actorRole: "manager", action: "manager_logged_in", entityType: "session", entityId: "MGR-001", description: "Oluwagbenga Kosoko logged in." },
      { id: "AUD-M02", actorId: "MGR-001", actorRole: "manager", action: "manager_submitted_application", entityType: "manager_organization_application", entityId: "MOA-001", description: "Application MOA-1001 (Beyond Drugs Pharmacy) submitted." },
      { id: "AUD-M03", actorId: "ADM-001", actorRole: "admin", action: "admin_assigned_manager", entityType: "pharmacy", entityId: "PHA-003", description: "WellnessPlus Pharmacy assigned to Oluwagbenga Kosoko — independent registration." },
      { id: "AUD-M04", actorId: "ADM-001", actorRole: "admin", action: "manager_reassigned", entityType: "pharmacy", entityId: "PHA-002", description: "Sunrise Pharmacy reassigned from Oluwagbenga Kosoko to Adaeze Umeh — territory realignment." },
      { id: "AUD-M05", actorId: "SYSTEM", actorRole: "system", action: "manager_earning_created", entityType: "manager_earning", entityId: "MGE-00004", description: "Earning MGE-00004 created from payment ORGP-1004 (Grace Community Pharmacy)." },
      { id: "AUD-M06", actorId: "MGR-001", actorRole: "manager", action: "manager_requested_payout", entityType: "payout_request", entityId: "MGP-001", description: "Manager requested a payout of ₦5,280." },
      { id: "AUD-M07", actorId: "MGR-001", actorRole: "manager", action: "manager_escalated_ticket", entityType: "support_ticket", entityId: "TKT-001", description: "TKT-1001 escalated to Finance — bank response pending beyond SLA." },
    ],
  });

  console.log("Seed complete ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
