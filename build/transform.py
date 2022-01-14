import yaml, sys
from os import path


def main(template, package, build_no, commit):

    # read template file
    with open(template) as input_file:
        template_doc = yaml.safe_load(input_file)


    print(template_doc)

    # read package file
    with open(package) as package_file:
        package_doc = yaml.safe_load(package_file)

    commit_short = commit[:6]
    sem_ver = ("%s+%s.%s" % (package_doc["version"], build_no, commit_short))

    template_doc["Metadata"] = {
        "AWS::ServerlessRepo::Application": {
            "Name": package_doc["name"],
            "Description": package_doc["description"],
            "Author": package_doc["author"]["name"],
            "SpdxLicenseId": package_doc["license"],
            "HomePageUrl": package_doc["homepage"],
            "SourceCodeUrl": ("%s/tree/%s" % (package_doc["homepage"], commit_short)),
            "SemanticVersion": sem_ver
        }
    }

    with open(path.join(path.dirname(input_file.name), 'packaged-versioned.yaml'), 'w') as output_file:
        yaml.dump(template_doc, output_file, sort_keys=False)

if __name__ == "__main__":
    template = sys.argv[1]
    package = sys.argv[2]
    build_no = sys.argv[3]
    commit = sys.argv[4]
    main(template, package, build_no, commit)
