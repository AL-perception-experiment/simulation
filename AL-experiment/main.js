/******* GLOBAL VARIABLES ****************************************************************/
/** CONSTANT VALUES */
var YES = 'Yes'; // Rhetorical question
var NO = 'No'; // Information-seeking question
var NONE = 'None'; // Other
var questionTypes = ["No", "None", "Yes"];
var mapping = {'Yes': 'Rhetorical Question', 'No': 'Information-seeking Question', 'None': 'Other'};
var experimentResults = {};
var trials = 0;
var maxTrials = 65;
/** feature encodings for association rule mining */
var featureEncoding = {'breathy': 1, 'modal': 2, 'e': 3, 'm': 4, 'long': 5, 'short': 6};
/** feature names, relevant indexes for association rule mining are: 3, 4, 5 */
var featureNames = [];
/** the data extracted from the text file */
var dataInstances = [];
/** currently displayed audio file */
var currentlySuggestedInstance = null;
/** association rule mining model */
var model = {};
/** combinations for the particular experiment */
var combinations = ["m_breathy_long", "m_breathy_short", "m_modal_long", "m_modal_short", "e_breathy_long", "e_breathy_short", "e_modal_long", "e_modal_short"];
/** labeled combinations */
var labeledCombinations = [];

/** read the data file, get all wav file titles */
var readData = function () {
    var request = new XMLHttpRequest();
    request.open('GET', 'data/pilot_stimuli.txt', true);
    request.responseType = 'blob';

    request.onload = function () {
        var reader = new FileReader();
        reader.readAsText(request.response, 'UTF-8');
        reader.onload = function (e) {

            // all the data rows
            var data = e.target.result;
            var instanceArray = data.split("\n");

            // first instance contain the feature names
            featureNames = instanceArray[0].split("\t");

            // remove the feature names
            instanceArray.splice(0, 1);

            // the remaining instances contain actual values
            instanceArray.forEach(function (stringInstance) {
                var attributes = stringInstance.split("\t");
                var instance = {};
                instance.title = attributes[featureNames.indexOf('sound')];
                instance.features = [];
                attributes.forEach(function (attribute, i) {
                    if (i > 2) {
                        instance.features.push(attribute.trim());
                    }
                });

                dataInstances.push(instance);
            });

            /** create association rule mining model */
            createModel();
            readResults();

        };
    };
    request.send();
};


/** read the data file, get all wav file titles */
var readResults = function () {
    var request = new XMLHttpRequest();
    request.open('GET', 'data/results.txt', true);
    request.responseType = 'blob';

    request.onload = function () {
        var reader = new FileReader();
        reader.readAsText(request.response, 'UTF-8');
        reader.onload = function (e) {
            // all the data rows
            var data = e.target.result;
            var instanceArray = data.split("\n");
            // first instance contain the feature names
            var combinations = instanceArray[0].split("\t");
            combinations.forEach(function (value, i) {
                experimentResults[value.trim() + ""] = instanceArray[1].split("\t")[i];
            });
            suggestNextInstance();
        };

    };
    request.send();
};

/** create association rule mining model */
var createModel = function () {
    var sets = [];

    dataInstances.forEach(function (instance) {
        var set = [];
        instance.features.forEach(function (feature) {
            set.push(featureEncoding[feature]);
        });
        sets.push(set);
    });

    // Execute FPGrowth with a minimum support of 40%. Algorithm is generic.
    var fpg = new fpgrowth.FPGrowth(0);

    fpg.exec(sets, function (itemsets) {
        itemsets.forEach(function (itemset, j) {
            model['rule' + j] = itemset;
        });
        initializeConfidence(model);
        mapInstancesToItemsets(sets);
    });
};

function checkElementsinArray(fixedArray, inputArray) {
    var fixedArraylen = fixedArray.length;
    var inputArraylen = inputArray.length;
    if (fixedArraylen <= inputArraylen) {
        for (var i = 0; i < fixedArraylen; i++) {
            if (!(inputArray.indexOf(fixedArray[i]) >= 0)) {
                return false;
            }
        }
    } else {
        return false;
    }
    return true;
}

/** each instance is linked to its representative itemsets; used to update the confidence of instances */
var mapInstancesToItemsets = function (transactions) {
    // add itemset and rules to each data instance
    transactions.forEach(function (transaction, i) {
        // add the relevant attributes to the data instance
        var currentInstance = dataInstances[i];
        currentInstance.itemset = transaction;
        currentInstance.confidence = 0.0;
        currentInstance.suggestedLabel = mapping[NONE];
        currentInstance.rules = [];

        Object.values(model).forEach(function (itemset, j) {
            itemset.id = 'rule' + j;
            itemset[YES] = 0;
            itemset[NO] = 0;
            itemset[NONE] = 0;
            if (checkElementsinArray(itemset.items, transaction)) {
                currentInstance.rules.push(itemset.id);
            }
        });

    });
};

/** set the confidence to 0.0 */
var initializeConfidence = function (model) {
    Object.values(model).forEach(function (itemset) {
        itemset.confidence = 0.0;
    });
};

/** update the confidence of the instances */
var updateModel = function (instance, label) {
    // first update the confidence of this instance and update the overall confidence of the model
    labelInstance(instance, label);
    // update the confidence of all instances
    labelAllInstances();
};

/** get next suggestion based on instance confidence after YES*/
var submitLabel = function (classLabel) {
    trials = trials + 1;
    if (trials < maxTrials) {
        console.log("SUBMITTED LABEL FROM VIRTUAL AGENT");
        //update the model
        console.log("UPDATE MODEL");
        updateModel(currentlySuggestedInstance, classLabel);
        console.log("SUGGEST NEXT INSTANCE");
        //suggest next UNCERTAIN instance
        suggestNextInstance();
    }
};

function shuffle(array) {
    var counter = array.length;
    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        var index = Math.floor(Math.random() * counter);
        // Decrease counter by 1
        counter--;
        // And swap the last element with it
        var temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }
    return array;
}

/** suggest next instance, it should be the most uncertan one */
var suggestNextInstance = function () {
    console.log(trials);
    console.log(model);
    console.log(dataInstances);
    var BreakException = {};

    var copyCombinations = [];
    combinations.forEach(function (comb) {
        copyCombinations.push(comb);
    });

    shuffle(copyCombinations);

    var nextcomb = "";
    try {
        copyCombinations.forEach(function (value) {
            if (labeledCombinations.indexOf(value) === -1) {
                labeledCombinations.push(value);
                nextcomb = value;
                throw BreakException;
            }
        });
    } catch (e) {
        if (e !== BreakException) throw e;
    }

    // if all combinations already labelled once
    if (nextcomb === "") {
        shuffle(dataInstances);
        // sort the instances ascending according to their confidence
        dataInstances.sort(function (a, b) {
            return a.confidence - b.confidence;
        });

        try {
            dataInstances.forEach(function (instance) {
                // if the instance has a low confidence AND it has not been labeled yet
                if (instance.labelFromVirtualAgent === undefined) {
                    currentlySuggestedInstance = instance;
                    specifyLabelByAgent(instance);
                    throw BreakException;
                }
            });
        } catch (e) {
            if (e !== BreakException) throw e;
        }
    } else {
        // if there is an unlabaled combination
        try {
            dataInstances.forEach(function (instance) {
                // if the instance has a low confidence AND it has not been labeled yet
                var comb = instance.features[1] + "_" + instance.features[0] + "_" + instance.features[2];
                if (instance.labelFromVirtualAgent === undefined && comb === nextcomb) {
                    currentlySuggestedInstance = instance;
                    specifyLabelByAgent(instance);
                    throw BreakException;
                }
            });
        } catch (e) {
            if (e !== BreakException) throw e;
        }
    }
};

/** get the label by the virtual agent based on a binomial function */
var specifyLabelByAgent = function (instance) {
    var combination = instance.features[1] + "_" +
        instance.features[0] + "_" +
        instance.features[2];
    // get the ground truth for RQ
    var groundTruthProbability = experimentResults[combination];
    // get a random prediction
    var random = Math.random();
    // specify label
    var classLabel = NONE;
    if (random <= groundTruthProbability) {
        classLabel = questionTypes[2];//RQ
    } else if (random > groundTruthProbability) {
        classLabel = questionTypes[0];//ISQ
    }
    submitLabel(classLabel);
};

/** label instance and add all relevant information */
var labelInstance = function (instance, label) {
    instance.labelFromVirtualAgent = mapping[label];

    // first, update the confidence of all currently labeled rules
    instance.rules.forEach(function (id) {
        var rule = model[id];
        rule[label]++;
        rule.confidence = Math.max(rule[YES], rule[NO]) / (rule[YES] + rule[NO] + rule[NONE]);
    });
};

/** based on the current model, update the confidence for all instances */
var labelAllInstances = function () {
    dataInstances.forEach(function (instance) {
        // get most likely class
        var yes = 0;
        var no = 0;
        instance.rules.forEach(function (id) {
            var rule = model[id];
            yes += rule[YES];
            no += rule[NO];
        });

        if (yes > no) {
            instance.suggestedLabel = mapping[YES];
        } else if (no > yes) {
            instance.suggestedLabel = mapping[NO];
        } else {
            instance.suggestedLabel = mapping[NONE];
        }

        if (yes + no > 0) {
            instance.confidence = Math.max(yes, no) / (yes + no);
        }
    });
};

/** read the data, create the initial model */
readData();