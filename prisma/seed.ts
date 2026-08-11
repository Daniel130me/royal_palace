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
    { id: "MED-001", name: "Amoxicillin", genericName: "Amoxicillin", brand: "Amoxil", category: "Prescription Medicine", strength: "500mg", dosageForm: "Capsule", manufacturer: "GSK", price: 4500, stock: 38, batch: "AMX2026A", expiry: "2027-05-01" },
    { id: "MED-002", name: "Amlodipine", genericName: "Amlodipine", brand: "Norvasc", category: "Prescription Medicine", strength: "10mg", dosageForm: "Tablet", manufacturer: "Pfizer", price: 6000, stock: 52, batch: "AML2026B", expiry: "2027-08-01" },
    { id: "MED-003", name: "Paracetamol", genericName: "Paracetamol", brand: "Panadol", category: "Over-the-Counter", strength: "500mg", dosageForm: "Tablet", manufacturer: "Emzor", price: 1200, stock: 200, batch: "PAR2026C", expiry: "2028-01-01", prescriptionRequired: false },
    { id: "MED-004", name: "Lisinopril", genericName: "Lisinopril", brand: "Zestril", category: "Prescription Medicine", strength: "20mg", dosageForm: "Tablet", manufacturer: "AstraZeneca", price: 7500, stock: 28, batch: "LIS2026D", expiry: "2027-03-01" },
    { id: "MED-005", name: "Metformin", genericName: "Metformin", brand: "Glucophage", category: "Prescription Medicine", strength: "850mg", dosageForm: "Tablet", manufacturer: "Merck", price: 5200, stock: 14, batch: "MET2025E", expiry: "2026-09-15" },
    { id: "MED-006", name: "Cetirizine", genericName: "Cetirizine", brand: "Zyrtec", category: "Over-the-Counter", strength: "10mg", dosageForm: "Tablet", manufacturer: "Johnson & Johnson", price: 2800, stock: 6, batch: "CET2024F", expiry: "2026-02-20", prescriptionRequired: false },
  ];
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
        prescriptionRequired: p.prescriptionRequired ?? true,
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
