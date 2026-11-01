# Deployment record

Database owner, as specified by the user: satit@hongson.ac.th
Intended production deployer: satit@hongson.ac.th
Account configuration: deployment-account.json

School web app:
https://script.google.com/a/macros/hongson.ac.th/s/AKfycbx7siPkwiUpfv21R6tc80sx6qTkvuU_Z9vhSu0102Vd6btC2jghlopmPGmPU2F8ABAU/exec

The public index.html redirects to that exact owner-provided school URL.
Anonymous loading currently reaches Google Sign in. Authenticated app/dashboard
behavior has not been inspected from this session.

The previously API-created project belongs to the local personal-account workflow
and is retained as legacy metadata only. It is not the school deployment. No
ownership transfer, data migration, permission change or project deletion was made.
The deploy helper now rejects a personal-account login and rejects a saved project
not bound to the configured school account before uploading or changing deployments.

Database: the user's existing MMC Sheet; five MC_ storage tabs were prepared while
preserving the original tab. Export destination: the user's existing MMC folder.
School Sheet and folder IDs remain unchanged.

Local source implements one GAS backend, server-verified teacher secret, shared
180-second deadline, canonical shuffled choices, durable server receipts and
private exports. The exact supplied KH3 DOCUMENTS questions remain server-only.
The school deployment's source has not been overwritten by the local account.

Private local teacher-code note: .private/teacher-access.txt
That code corresponds to the local Secrets.gs verifier; using it on the school
deployment requires that deployment to contain the same verifier.
