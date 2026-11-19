// Demo data so the team can try every screen. Only offered while there are no jobs.
import { q, one, j } from './db';
import { PORTALS, token } from './util';
import { ingestResume } from './ingest';

const RESUMES = [
  ['Rohan Mehta', 'rohan.mehta@example.com', '9876500021', 'DevOps Lead at Infosys, Bangalore', 7.2, 'AWS, EKS, Kubernetes, Terraform, Docker, Helm, ArgoCD, GitHub Actions, CI/CD, Python, Linux', 'Led migration of 40+ services to EKS. Wrote the Terraform module library used by 12 teams. Moved batch jobs to spot instances to cut AWS cost.', 26, 34, 30],
  ['Ananya Iyer', 'ananya.iyer@example.com', '9876500022', 'Cloud Engineer at Thoughtworks, Bangalore', 6, 'AWS, Terraform, Python, Kubernetes, CI/CD, Linux, Docker', 'Built AWS landing zones with Terraform for 3 enterprise clients. Ran Kubernetes clusters and Jenkins pipelines.', 22, 30, 15],
  ['Karthik Rao', 'karthik.rao@example.com', '9876500023', 'Site Reliability Engineer at a food delivery company, Bangalore', 5.5, 'Kubernetes, Prometheus, Grafana, AWS, Terraform, Go, Linux, CI/CD', 'On-call lead for payments platform. Built SLO dashboards in Grafana. Automated EKS upgrades.', 28, 36, 60],
  ['Fatima Sheikh', 'fatima.sheikh@example.com', '9876500024', 'DevOps Engineer at Wipro, Pune', 5.1, 'Azure DevOps, Terraform, Docker, Kubernetes, Linux, CI/CD', 'Azure-heavy DevOps work: AKS clusters, Terraform, release pipelines. Ready to relocate to Bangalore.', 18, 26, 0],
  ['Pooja Reddy', 'pooja.reddy@example.com', '9876500025', 'Cloud Administrator at HCL, Hyderabad', 5.8, 'AWS, Linux, Ansible, Bash', 'Manages EC2 fleets and patching with Ansible. Some CloudFormation.', 14, 20, 30],
  ['Arvind Pillai', 'arvind.pillai@example.com', '9876500026', 'DevOps Engineer at a fintech, Bangalore', 5.8, 'AWS, Kubernetes, GitHub Actions, CI/CD, Terraform, Docker, Linux', 'Owns CI/CD for 60 microservices. Self-managed Kubernetes on AWS. Terraform for networking.', 29, 35, 30],
  ['Sneha Kulkarni', 'sneha.kulkarni@example.com', '9876500027', 'Cloud Engineer at Accenture, Bangalore', 6.5, 'AWS, EKS, Kubernetes, Terraform, CI/CD, Linux, Python, Docker', 'Ran EKS for a banking client. Strong Terraform and IAM design.', 25, 33, 30],
  ['Vivek Menon', 'vivek.menon@example.com', '9876500028', 'Cloud Architect at a consulting firm, Pune', 11, 'Azure, AKS, Terraform, Networking, Security, Azure DevOps', 'Designed Azure landing zones and hub-spoke networks for 10+ enterprises.', 42, 52, 60],
];

function resumeText([name, email, phone, line, exp, skills, body, cctc, ectc, np]) {
  return `${name}\n${email} | +91 ${phone}\n${line}\n\nSummary\n${exp} years of experience. ${body}\n\nSkills\n${skills}\n\nCompensation\nCurrent CTC: ${cctc} LPA. Expected CTC: ${ectc} LPA. Notice period: ${np === 0 ? 'Immediate' : `${np} days`}.\n\nExperience\n${line} (2021 - present)\n${body}\nPrevious role (2017 - 2021): DevOps engineer working on CI/CD and Linux servers.\n\nEducation\nB.E. Computer Science, 2016`;
}

export async function loadSampleData() {
  const has = await one('SELECT count(*)::int AS n FROM jobs');
  if (has.n > 0) throw new Error('Sample data can only be loaded into an empty workspace.');

  const c1 = await one(`INSERT INTO clients (name, cloud, city, revenue_cr, contact_name, contact_email, status) VALUES ('Nimbus Cloudworks (sample)', 'AWS', 'Bangalore', 180, 'Arjun Nair', 'arjun@nimbus.example', 'active') RETURNING id`);
  const c2 = await one(`INSERT INTO clients (name, cloud, city, revenue_cr, contact_name, contact_email, status) VALUES ('Stratus Ops (sample)', 'Azure', 'Pune', 95, 'Meera Joshi', 'meera@stratus.example', 'active') RETURNING id`);
  await q(`INSERT INTO clients (name, cloud, city, revenue_cr, status) VALUES ('Kovai Cloud Labs (sample)', 'GCP', 'Coimbatore', 55, 'on hold')`);
  for (const p of [['Vertex Cloud Partners', 'AWS', 'Bangalore', 120, '14 open roles on LinkedIn', 'LinkedIn'], ['BlueOrbit Tech', 'Azure', 'Pune', 75, 'Hiring 6 cloud engineers', 'Indeed'], ['Monsoon Data Cloud', 'GCP', 'Mumbai', 300, 'New Hyderabad office', 'Referral'], ['Tiny Hosting Co', 'AWS', 'Jaipur', 12, null, 'Manual']]) {
    await q('INSERT INTO prospects (name, cloud, city, revenue_cr, signal, source) VALUES ($1,$2,$3,$4,$5,$6)', p);
  }

  const mkJob = async (client, v) => {
    const row = await one(
      `INSERT INTO jobs (client_id, slug, title, openings, employment_type, work_mode, location, exp_min, exp_max, ctc_min, ctc_max, joining_timeline, mandatory_skills, preferred_skills, description, screening_questions, interview_rounds, client_contact, hm_notes, public_company, min_score)
       VALUES ($1,$2,$3,$4,'Permanent',$5,$6,$7,$8,$9,$10,'Within 30 days',$11::jsonb,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,60) RETURNING id`,
      [client, `${v.slug}-${token(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`, v.title, v.openings, v.mode, v.location, v.exp[0], v.exp[1], v.ctc[0], v.ctc[1], j(v.must), j(v.pref), v.desc, j(v.questions), j(v.rounds), j(v.contact), j(v.hm), v.public],
    );
    for (const p of PORTALS) await q('INSERT INTO job_postings (job_id, portal, status, posted_at) VALUES ($1,$2,$3,$4)', [row.id, p.id, p.id === 'careers' ? 'live' : p.id === 'google' ? 'submitted' : 'not_posted', p.id === 'careers' ? new Date() : null]);
    return row.id;
  };
  const std = [{ q: 'What is your current CTC and expected CTC?', type: 'Salary' }, { q: 'What is your notice period? Can it be bought out?', type: 'Notice period' }];
  const job1 = await mkJob(c1.id, {
    slug: 'senior-devops-engineer-aws', title: 'Senior DevOps Engineer (AWS)', openings: 3, mode: 'Hybrid', location: 'Bangalore (Whitefield)', exp: [5, 8], ctc: [28, 36],
    must: ['AWS', 'Terraform', 'Kubernetes (EKS)', 'CI/CD', 'Linux'], pref: ['AWS certification', 'Python', 'Prometheus'],
    desc: 'Design, automate and run AWS infrastructure for enterprise customers.\n\nResponsibilities:\n- Build and maintain Terraform modules\n- Run EKS clusters in production\n- Own CI/CD pipelines\n- Set up monitoring and on-call runbooks\n\nMust have: AWS, Terraform, Kubernetes (EKS), CI/CD, Linux.\nGood to have: AWS certification, Python, Prometheus.',
    questions: [{ q: 'Walk me through an EKS cluster you set up and ran in production.', type: 'Open answer' }, { q: 'How many years have you written Terraform from scratch?', type: 'Number' }, ...std, { q: 'Are you open to working hybrid from Whitefield, Bangalore?', type: 'Yes / no' }],
    rounds: [{ name: 'AI screening call', by: 'AvaStars bot' }, { name: 'Technical interview', by: 'Client panel' }, { name: 'Hiring manager round', by: 'Sanjay Kumar' }],
    contact: { name: 'Arjun Nair', email: 'arjun@nimbus.example' }, hm: { manager: 'Sanjay Kumar', must: 'Hands-on EKS in production.', flexible: 'Certification not required.', conditions: ['Immediate joiners preferred'] }, public: 'Leading AWS partner',
  });
  await mkJob(c2.id, {
    slug: 'azure-cloud-architect', title: 'Azure Cloud Architect', openings: 1, mode: 'WFO', location: 'Pune', exp: [10, 15], ctc: [45, 60],
    must: ['Azure', 'Terraform', 'Networking', 'Security'], pref: ['AKS', 'Azure DevOps'],
    desc: 'Lead Azure architecture for enterprise migrations: landing zones, networking and security.', questions: [{ q: 'Describe a hub-spoke network you designed on Azure.', type: 'Open answer' }, ...std],
    rounds: [{ name: 'AI screening call', by: 'AvaStars bot' }, { name: 'Architecture interview', by: 'Client CTO' }], contact: { name: 'Meera Joshi', email: 'meera@stratus.example' }, hm: {}, public: 'Azure solutions company',
  });

  const ids = [];
  for (const r of RESUMES) {
    const res = await ingestResume({ buffer: Buffer.from(resumeText(r)), filename: `${r[0].replace(/ /g, '_')}_resume.txt`, mime: 'text/plain', source: ['LinkedIn', 'Careers page', 'Naukri', 'Indeed'][ids.length % 4], jobId: r[0] === 'Vivek Menon' ? null : job1, overrides: { cctc: r[7], ectc: r[8], notice_days: r[9], total_exp: r[4] } });
    ids.push(res);
  }
  return { jobs: 2, candidates: ids.length };
}
