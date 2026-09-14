---
name: rancher-charts
description: Create or update Rancher Helm charts and Rancher-specific chart metadata.
metadata:
  categories:
    - helm
    - kubernetes
  references:
    - https://ranchermanager.docs.rancher.com/how-to-guides/new-user-guides/helm-charts-in-rancher/create-apps
---

# rancher-charts

## Overview

Rancher supports two different types of charts: Helm charts and Rancher charts. Native Helm charts include an application along with other software required to run it. When deploying native Helm charts, you can provide the chart's parameter values in a YAML editor.

Rancher charts are native Helm charts with two files that enhance user experience: `app-readme.md` and `questions.yaml`. Rancher charts add simplified chart descriptions and configuration forms to make the application deployment easy. Rancher users do not need to read through the entire list of Helm variables to understand how to launch an application.

## Chart Directory Structure

You can provide Helm Charts in a standard, HTTP based Helm Repository. Alternatively you can organize your charts in a Git Repository and directly add this to the App Marketplace.

The following table demonstrates the directory structure for a Git repository. The `charts` directory is the top level directory under the repository base. Adding the repository to Rancher will expose all charts contained within it. The `questions.yaml`, `README.md`, and `requirements.yml` files are specific to Rancher charts, but are optional for chart customization.

```plaintext
<Repository-Base>/
 │
 ├── charts/
 │   ├── <Application Name>/   # This directory name will be surfaced in the Rancher UI as the chart name
 │   │   ├── <App Version>/   # Each directory at this level provides different app versions that will be selectable within the chart in the Rancher UI
 │   │   │   ├── Chart.yaml   # Required Helm chart information file.
 │   │   │   ├── questions.yaml   # Form questions displayed within the Rancher UI. Questions display in Configuration Options.*
 │   │   │   ├── README.md         # Optional: Helm Readme file displayed within Rancher UI. This text displays in Detailed Descriptions.
 │   │   │   ├── requirements.yml  # Optional: YAML file listing dependencies for the chart.
 │   │   │   ├── values.yml        # Default configuration values for the chart.
 │   │   │   ├── templates/        # Directory containing templates that, when combined with values.yml, generates Kubernetes YAML.
```

## Additional Files for Rancher Charts

Before you create your own custom catalog, you should have a basic understanding about how a Rancher chart differs from a native Helm chart. Rancher charts differ slightly from Helm charts in their directory structures. Rancher charts include two files that Helm charts do not.

- `app-readme.md`

    A file that provides descriptive text in the chart's UI header.

- `questions.yml`

    A file that contains questions for a form. These form questions simplify deployment of a chart. Without it, you must configure the deployment using a values YAML config, which is more difficult.

### Chart.yaml

#### Annotations

Rancher supports additional annotations that you can add to the `Chart.yaml` file. These annotations allow you to define application dependencies or configure additional UI defaults:

| Annotation                        | Description | Example |
| --------------------------------- | ----------- | ------- |
| catalog.cattle.io/auto-install    | If set, will install the specified chart in the specified version before installing this chart | other-chart-name=1.0.0 |
| catalog.cattle.io/display-name    | A display name that should be displayed in the App Marketplace instead of the chart name | Display Name of Chart |
| catalog.cattle.io/namespace       | A fixed namespace where the chart should be deployed in. If set, this can't be changed by the user | fixed-namespace |
| catalog.cattle.io/release-name    | A fixed release name for the Helm installation. If set, this can't be changed by the user | fixed-release-name |
| catalog.cattle.io/requests-cpu    | Total amount of CPU that should be unreserved in the cluster. If less CPU is available, a warning will be shown | 2000m |
| catalog.cattle.io/requests-memory | Total amount of memory that should be unreserved in the cluster. If less memory is available, a warning will be shown | 2Gi |
| catalog.cattle.io/os              | Restricts the OS where this chart can be installed. Possible values: `linux`, `windows`. Default: no restriction | linux |

### Keywords

With the `keywords` option in the `Chart.yaml` file it is possible to provide a list of categories for sorting your application in the Rancher UI, like `infrastructure`, `monitoring` and more.

### questions.yml

Inside the `questions.yml`, most of the content will be around the questions to ask the end user, but there are some additional fields that can be set in this file.

### Min/Max Rancher versions

For each chart, you can add the minimum and/or maximum Rancher version, which determines whether or not this chart is available to be deployed from Rancher.

> Even though Rancher release versions are prefixed with a `v`, there is *no* prefix for the release version when using this option.

```plaintext
rancher_min_version: 2.3.0
rancher_max_version: 2.3.99
```

### Question Variable Reference

This reference contains variables that you can use in `questions.yml` nested under `questions:`.

| Variable  | Type | Required | Description |
| ------------- | ------------- | --- |------------- |
|  variable          | string  | true    |  Define the variable name specified in the `values.yml` file, using `foo.bar` for nested objects. |
|  label             | string  | true      |  Define the UI label. |
|  description       | string  | false      |  Specify the description of the variable.|
|  type              | string  | false      |  Default to `string` if not specified (current supported types are string, multiline, boolean, int, enum, password, storageclass, hostname, pvc, secret and cloudcredential).|
|  required          | bool    | false      |  Define if the variable is required or not (true \| false)|
|  default           | string  | false      |  Specify the default value. Only used if there is no corresponding value in the `values.yml` file. |
|  group             | string  | false      |  Group questions by input value. |
|  min_length        | int     | false      |  Min character length.|
|  max_length        | int     | false      | Max character length.|
|  min               | int     | false      |  Min integer value. |
|  max               | int     | false      |  Max integer value. |
|  options           | []string | false     |  Specify the options when the variable type is `enum`, for example: options:<br/> - "ClusterIP" <br/> - "NodePort" <br/> - "LoadBalancer"|
|  valid_chars       | string   | false     |  Regular expression for input chars validation. |
|  invalid_chars     | string   | false     |  Regular expression for invalid input chars validation.|
|  subquestions      | []subquestion | false|  Add an array of subquestions.|
|  show_if           | string      | false  | Show current variable if conditional variable is true. For example `show_if: "serviceType=Nodeport"` |
|  show_subquestion_if |  string  | false     | Show subquestions if is true or equal to one of the options. for example `show_subquestion_if: "true"`|

> `subquestions[]` cannot contain `subquestions` or `show_subquestions_if` keys, but all other keys in the above table are supported.

### Example questions.yaml

```yaml
questions:
# Questions for tab named "Some Example ConfigMap Values"
- variable: configMap.docker.enabled
  default: true
  description:  Example description of a boolean input
  type: boolean
  label: Example Boolean - Enable Docker Runtime
  show_subquestion_if: true
  group: "Some Example ConfigMap Values"
  subquestions:
  - variable: configMap.docker.path
    default: "/var/run/docker.sock"
    description: "Example of a conditionally rendered input. Docker Runtime Path"
    type: string
    label: Runtime Path
- variable: configMap.testFloat
  default: 1.11
  description: Description of the float input
  type: float
  label: Float Label
  group: "Some Example ConfigMap Values"
- variable: configMap.nameOfAnotherConfigMap
  description: Reference a ConfigMap by name.
  type: reference_configmap
  label: Reference a ConfigMap
  group: "Some Example ConfigMap Values"
- variable: configMap.nameOfSecret
  description: Reference a Secret by name
  type: reference_secret
  label: Reference a Secret
  group: "Some Example ConfigMap Values"
- variable: configMap.nameOfStorageClass
  description: StorageClass to be used
  type: reference_storage.k8s.io.storageclass
  label: Storage Class
  group: "Some Example ConfigMap Values"
- variable: configMap.nameOfIngressClass
  description: Reference an IngressClass by name (can also reference any arbitrary resource)
  type: reference_networking.k8s.io.ingressclass
  label: Reference an IngressClass
  group: "Some Example ConfigMap Values"
- variable: configMap.listOfStrings
  description: List of strings
  type: listofstrings
  label: List of Strings
  group: "Some Example ConfigMap Values"
- variable: configMap.yamlFile
  description: YAML input
  type: yamlfile
  label: Upload YAML File
  group: "Some Example ConfigMap Values"
- variable: configMap.tmplFile
  description: TMPL input
  type: tmplfile
  label: Upload TMPL File
  group: "Some Example ConfigMap Values"
- variable: configMap.cloudCredential
  description: Select a cloud credential
  type: cloudcredential
  label: Cloud Credential
  group: "Some Example ConfigMap values"

# Questions for tab named "Some Example Deployment Values"
- variable: deployment.name
  default: "Default name"
  description: Example description of a string input
  type: string
  label: Deployment Name
  group: "Some Example Deployment Values"
- variable: deployment.replicaCount
  default: 1
  description: Replicas
  type: integer
  label: Replicas
  group: "Some Example Deployment Values"
- variable: deployment.labels
  description: Add labels here. This is a key-value pair component with a button that allows uploading values from files.
  type: labels
  label: Labels
  group: "Some Example Deployment Values"
- variable: deployment.annotations
  description: Add annotations here. This component is the same as the component for labels, except that the value input is a multiline code editor that will visually preserve the spacing when uploading values from files.
  type: annotations
  label: Annotations
  group: "Some Example Deployment Values"
- variable: deployment.imagePullPolicy
  default: "Always"
  description: Set a pull policy for the container image
  type: enum
  label: Image Pull Policy
  group: "Some Example Deployment Values"
  options:
  - "Always"
  - "IfNotPresent"
  - "Never"
- variable: deployment.nodeSelectors
  description: Add node affinity details here
  type: nodeselectors
  label: Node Selectors
  group: "Some Example Deployment Values"
- variable: deployment.tolerations
  description: Add tolerations here
  type: tolerations
  label: Tolerations
  group: "Some Example Deployment Values"
- variable: deployment.affinity
  description: Add node affinity rules here
  type: affinityrules
  label: Node Affinity
  group: "Some Example Deployment Values"
```
